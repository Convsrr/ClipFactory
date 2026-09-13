import os
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np
from fastapi.testclient import TestClient

import app as tracker


class TrackerTests(unittest.TestCase):
    def setUp(self):
        os.environ["TRACKER_API_KEY"] = "test-secret"

    def test_health_requires_storage_configuration(self):
        response = TestClient(tracker.app).get("/health")
        self.assertEqual(response.status_code, 503)
        self.assertFalse(response.json()["ok"])

    def test_track_rejects_missing_bearer_token(self):
        response = TestClient(tracker.app).post("/track", json={})
        self.assertEqual(response.status_code, 401)

    def test_request_rejects_parent_object_key(self):
        with self.assertRaises(ValueError):
            tracker.TrackingRequest(
                projectId="project",
                videoId="video",
                proxyObjectKey="../video.mp4",
                sourceTimebase="absolute-video-seconds",
                coordinateSpace="normalized",
                clips=[{"id": "clip", "startSec": 0, "endSec": 1, "trackingMode": "action"}],
            )

    def test_action_tracker_follows_local_motion(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "motion.mp4"
            writer = cv2.VideoWriter(str(video), cv2.VideoWriter_fourcc(*"mp4v"), 10, (320, 180))
            self.assertTrue(writer.isOpened())
            for index in range(30):
                frame = np.zeros((180, 320, 3), dtype=np.uint8)
                x = 170 + index * 2
                cv2.rectangle(frame, (x, 55), (x + 45, 145), (255, 255, 255), -1)
                writer.write(frame)
            writer.release()

            result = tracker.track_clip(video, tracker.ClipRequest(id="sports", startSec=0, endSec=2.5, trackingMode="action"))
            self.assertIsNotNone(result)
            assert result is not None
            self.assertTrue(result.tracks)
            self.assertTrue(all(point.focusX > 0.5 for point in result.tracks))
            self.assertTrue(all(point.confidence >= tracker.MIN_ACTION_CONFIDENCE for point in result.tracks))


if __name__ == "__main__":
    unittest.main()
