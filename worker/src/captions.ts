import { writeFile } from "node:fs/promises";

const styles: Record<string, string> = {
  "bold-viral": "Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,2,90,90,220,1",
  "minimal-clean": "Arial,54,&H00FFFFFF,&H000000FF,&H00161616,&H60000000,0,0,0,0,100,100,0,0,1,2,1,2,110,110,180,1",
  podcast: "Arial,60,&H00FFFFFF,&H000000FF,&H00352962,&H70000000,-1,0,0,0,100,100,0,0,3,4,1,2,100,100,210,1",
};

export async function writeCaptionFile(path: string, text: string, durationSec: number, presetKey: string) {
  const safeText = text.replaceAll("\n", " ").replaceAll("{", "(").replaceAll("}", ")");
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding\nStyle: Default,${styles[presetKey] ?? styles["minimal-clean"]}\n\n[Events]\nFormat: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text\nDialogue: 0,0:00:00.00,${assTime(durationSec)},Default,,0,0,0,,${safeText}\n`;
  await writeFile(path, ass, "utf8");
}

function assTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const whole = Math.floor(seconds % 60);
  const centiseconds = Math.floor((seconds % 1) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}
