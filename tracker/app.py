from __future__ import annotations

import hmac
import math
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import boto3
import cv2
import numpy as np
from botocore.config import Config
from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


SAMPLE_INTERVAL_SEC = 0.5
ANALYSIS_WIDTH = 480
MAX_CLIPS = 12
MAX_CLIP_DURATION_SEC = 180.0
MAX_SOURCE_BYTES = 2_000_000_000
MIN_ACTION_CONFIDENCE = 0.52
MIN_FACE_CONFIDENCE = 0.5
OBJECT_KEY_PATTERN = re.compile(r"^[^\x00-\x1f]{1,1024}$")


class ClipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=200)
    startSec: float = Field(ge=0)
    endSec: float = Field(gt=0)
    trackingMode: Literal["face", "action"] = "face"

    @model_validator(mode="after")
    def validate_duration(self) -> "ClipRequest":
        duration = self.endSec - self.startSec
        if duration <= 0 or duration > MAX_CLIP_DURATION_SEC:
            raise ValueError(f"clip duration must be between 0 and {MAX_CLIP_DURATION_SEC:g} seconds")
        return self


class TrackingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    projectId: str = Field(min_length=1, max_length=200)
    videoId: str = Field(min_length=1, max_length=200)
    proxyObjectKey: str
    sourceTimebase: Literal["absolute-video-seconds"]
    coordinateSpace: Literal["normalized"]
    clips: list[ClipRequest] = Field(min_length=1, max_length=MAX_CLIPS)

    @field_validator("proxyObjectKey")
    @classmethod
    def validate_object_key(cls, value: str) -> str:
        if not OBJECT_KEY_PATTERN.fullmatch(value) or value.startswith("/") or ".." in value.split("/"):
            raise ValueError("proxyObjectKey is invalid")
        return value


class TrackPoint(BaseModel):
    startSec: float
    endSec: float
    focusX: float = Field(ge=0, le=1)
    focusY: float = Field(ge=0, le=1)
    confidence: float = Field(ge=0, le=1)
    faceArea: float | None = Field(default=None, ge=0, le=1)


class ClipResult(BaseModel):
    clipId: str
    subjectId: str
    tracks: list[TrackPoint]


class TrackingResponse(BaseModel):
    sourceTimebase: Literal["absolute-video-seconds"] = "absolute-video-seconds"
    coordinateSpace: Literal["normalized"] = "normalized"
    clips: list[ClipResult]


@dataclass(frozen=True)
class Detection:
    x: float
    y: float
    confidence: float
    area: float = 0.0


app = FastAPI(title="ClipFactory Tracker", version="1.0.0", docs_url=None, redoc_url=None)


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def authenticate(authorization: str | None = Header(default=None)) -> None:
    expected = required_env("TRACKER_API_KEY")
    supplied = authorization.removeprefix("Bearer ") if authorization and authorization.startswith("Bearer ") else ""
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def storage_client():
    account_id = required_env("R2_ACCOUNT_ID")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=required_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=required_env("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
        config=Config(connect_timeout=10, read_timeout=60, retries={"max_attempts": 3, "mode": "standard"}),
    )


def download_proxy(object_key: str, destination: Path) -> None:
    client = storage_client()
    metadata = client.head_object(Bucket=required_env("R2_BUCKET"), Key=object_key)
    size = int(metadata.get("ContentLength", 0))
    if size <= 0 or size > MAX_SOURCE_BYTES:
        raise HTTPException(status_code=422, detail="Source video size is unsupported")
    client.download_file(required_env("R2_BUCKET"), object_key, str(destination))


@app.get("/health")
def health(response: Response) -> dict[str, object]:
    required = ["TRACKER_API_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]
    configured = all(bool(os.getenv(name, "").strip()) for name in required)
    if not configured:
        response.status_code = 503
    return {"ok": configured, "service": "clipfactory-tracker", "version": os.getenv("RELEASE_SHA", "development")}


@app.post("/track", response_model=TrackingResponse, dependencies=[Depends(authenticate)])
def track(request: TrackingRequest) -> TrackingResponse:
    with tempfile.TemporaryDirectory(prefix="clipfactory-tracker-") as directory:
        source = Path(directory) / "proxy.mp4"
        download_proxy(request.proxyObjectKey, source)
        results = [result for clip in request.clips if (result := track_clip(source, clip)) is not None]
    return TrackingResponse(clips=results)


def track_clip(source: Path, clip: ClipRequest) -> ClipResult | None:
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise HTTPException(status_code=422, detail="Source video could not be decoded")

    try:
        if clip.trackingMode == "action":
            points = action_points(capture, clip)
            subject_id = "primary-action"
        else:
            points = face_points(capture, clip)
            subject_id = "primary-face"
    finally:
        capture.release()

    return ClipResult(clipId=clip.id, subjectId=subject_id, tracks=points) if points else None


def sampled_frames(capture: cv2.VideoCapture, clip: ClipRequest):
    timestamp = clip.startSec
    while timestamp < clip.endSec - 0.001:
        capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000)
        ok, frame = capture.read()
        if not ok or frame is None:
            timestamp += SAMPLE_INTERVAL_SEC
            continue
        height, width = frame.shape[:2]
        scale = min(1.0, ANALYSIS_WIDTH / max(1, width))
        if scale < 1:
            frame = cv2.resize(frame, (max(2, round(width * scale)), max(2, round(height * scale))), interpolation=cv2.INTER_AREA)
        yield timestamp, frame
        timestamp += SAMPLE_INTERVAL_SEC


def face_points(capture: cv2.VideoCapture, clip: ClipRequest) -> list[TrackPoint]:
    detector = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"))
    points: list[TrackPoint] = []
    previous: Detection | None = None
    for timestamp, frame in sampled_frames(capture, clip):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = detector.detectMultiScale(gray, scaleFactor=1.12, minNeighbors=5, minSize=(24, 24))
        candidates = [
            Detection(
                x=(x + width / 2) / frame.shape[1],
                y=(y + height / 2) / frame.shape[0],
                confidence=min(0.95, 0.58 + (width * height) / (frame.shape[0] * frame.shape[1]) * 4),
                area=(width * height) / (frame.shape[0] * frame.shape[1]),
            )
            for x, y, width, height in faces
        ]
        selected = select_candidate(candidates, previous)
        if selected and selected.confidence >= MIN_FACE_CONFIDENCE:
            points.append(to_point(timestamp, clip.endSec, selected, face=True))
            previous = selected
    return coalesce_points(points)


def action_points(capture: cv2.VideoCapture, clip: ClipRequest) -> list[TrackPoint]:
    points: list[TrackPoint] = []
    previous_gray: np.ndarray | None = None
    previous_detection: Detection | None = None
    for timestamp, frame in sampled_frames(capture, clip):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (7, 7), 0)
        if previous_gray is None:
            previous_gray = gray
            continue

        flow = cv2.calcOpticalFlowFarneback(previous_gray, gray, None, 0.5, 3, 15, 2, 5, 1.1, 0)
        median_flow = np.median(flow.reshape(-1, 2), axis=0)
        residual = flow - median_flow
        magnitude = cv2.magnitude(residual[..., 0], residual[..., 1])
        candidates = motion_candidates(magnitude)
        selected = select_candidate(candidates, previous_detection)
        if selected and selected.confidence >= MIN_ACTION_CONFIDENCE:
            points.append(to_point(timestamp, clip.endSec, selected, face=False))
            previous_detection = selected
        previous_gray = gray
    return coalesce_points(points)


def motion_candidates(magnitude: np.ndarray) -> list[Detection]:
    height, width = magnitude.shape
    if width < 2 or height < 2:
        return []
    border_x, border_y = max(1, width // 20), max(1, height // 20)
    magnitude[:border_y, :] = 0
    magnitude[-border_y:, :] = 0
    magnitude[:, :border_x] = 0
    magnitude[:, -border_x:] = 0
    nonzero = magnitude[magnitude > 0]
    if nonzero.size < 20:
        return []
    threshold = max(1.0, float(np.percentile(nonzero, 88)))
    mask = np.uint8(magnitude >= threshold) * 255
    kernel = np.ones((5, 5), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask)
    frame_area = width * height
    candidates: list[Detection] = []
    global_motion = float(np.mean(magnitude))
    for label in range(1, count):
        area = int(stats[label, cv2.CC_STAT_AREA])
        area_ratio = area / frame_area
        if area_ratio < 0.002 or area_ratio > 0.35:
            continue
        component_motion = float(np.mean(magnitude[labels == label]))
        distinctness = component_motion / max(0.25, global_motion)
        confidence = min(0.96, 0.34 + min(0.34, area_ratio * 5) + min(0.28, max(0, distinctness - 1) * 0.12))
        x, y = centroids[label]
        candidates.append(Detection(x=float(x / width), y=float(y / height), confidence=confidence, area=area_ratio))
    return candidates


def select_candidate(candidates: list[Detection], previous: Detection | None) -> Detection | None:
    if not candidates:
        return None
    def score(candidate: Detection) -> float:
        area_bonus = min(0.2, math.sqrt(max(0, candidate.area)) * 0.5)
        if previous is None:
            center_distance = math.hypot(candidate.x - 0.5, candidate.y - 0.5)
            return candidate.confidence + area_bonus - center_distance * 0.08
        distance = math.hypot(candidate.x - previous.x, candidate.y - previous.y)
        return candidate.confidence + area_bonus - distance * 0.45
    return max(candidates, key=score)


def to_point(timestamp: float, clip_end: float, detection: Detection, *, face: bool) -> TrackPoint:
    return TrackPoint(
        startSec=round(timestamp, 3),
        endSec=round(min(clip_end, timestamp + SAMPLE_INTERVAL_SEC), 3),
        focusX=round(float(np.clip(detection.x, 0, 1)), 5),
        focusY=round(float(np.clip(detection.y, 0, 1)), 5),
        confidence=round(float(np.clip(detection.confidence, 0, 1)), 4),
        faceArea=round(float(np.clip(detection.area, 0, 1)), 5) if face else None,
    )


def coalesce_points(points: list[TrackPoint]) -> list[TrackPoint]:
    if not points:
        return []
    output = [points[0]]
    for point in points[1:]:
        previous = output[-1]
        if (
            abs(previous.endSec - point.startSec) < 0.01
            and abs(previous.focusX - point.focusX) < 0.015
            and abs(previous.focusY - point.focusY) < 0.015
        ):
            previous.endSec = point.endSec
            previous.confidence = round((previous.confidence + point.confidence) / 2, 4)
        else:
            output.append(point)
    return output
