// 导入FFmpeg相关模块
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { toast } from "sonner";

let loaded: Boolean = false;

// 创建FFmpeg实例
let ffmpegInstance: FFmpeg | null = null;

// 获取FFmpeg实例
const getFFmpegInstance = (): FFmpeg => {
  if (!ffmpegInstance) {
    ffmpegInstance = new FFmpeg();
  }
  return ffmpegInstance;
};

// 加载FFmpeg
export const loadFFmpeg = async (): Promise<boolean> => {
  try {
    const ffmpeg = getFFmpegInstance();
    ffmpeg.on("log", ({ message }) => {
      console.log(message);
    });
    // 检查是否已加载
    if (loaded) {
      return true;
    }
    const baseURL = "/assets/core/package/dist/esm";
    // 加载FFmpeg核心
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm"
      ),
    });
    return true;
  } catch (error) {
    console.error("Failed to load FFmpeg:", error);
    toast.error("FFmpeg加载失败，请刷新页面重试");
    return false;
  }
};

// 转换视频
export const convertVideo = async (
  file: File,
  outputFormat: string,
  resolution: string,
  quality: number,
  fps: number,
  onProgress: (progress: number) => void
): Promise<File> => {
  try {
    const ffmpeg = getFFmpegInstance();
    await loadFFmpeg();

    // 写入输入文件
    const inputExtension = file.name.split(".").pop() || "mp4";
    const inputFileName = `input.${inputExtension}`;
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    // 设置输出文件名
    const outputFileName = `output.${outputFormat}`;

    // 构建FFmpeg命令
    const commands: string[] = ["-i", inputFileName];

    // 添加视频编码器
    commands.push("-c:v", "libx264");

    // 添加质量设置
    commands.push("-crf", (51 - quality * 0.51).toString()); // 转换0-100的质量值到18-51的crf值

    // 添加帧率设置
    if (fps > 0) {
      commands.push("-r", fps.toString());
    }

    // 添加分辨率设置
    if (resolution !== "original") {
      let size: string;
      switch (resolution) {
        case "360p":
          size = "640x360";
          break;
        case "720p":
          size = "1280x720";
          break;
        case "1080p":
          size = "1920x1080";
          break;
        case "2160p":
          size = "3840x2160";
          break;
        default:
          size = "1280x720";
      }
      commands.push("-s", size);
    }

    // 添加音频设置
    commands.push("-c:a", "aac", "-b:a", "128k");

    // 添加输出文件名
    commands.push(outputFileName);

    // 开始转换前的准备工作
    onProgress(0);

    // 执行转换
    await ffmpeg.exec(commands);

    // 读取输出文件
    const fileData = await ffmpeg.readFile(outputFileName);
    // @ts-ignore
    const data = new Uint8Array(fileData as ArrayBuffer);
    // 创建Blob对象
    const blob = new Blob([data.buffer], { type: `video/${outputFormat}` });

    // 创建File对象
    const outputFile = new File(
      [blob],
      `${file.name.split(".")[0]}.${outputFormat}`,
      {
        type: `video/${outputFormat}`,
      }
    );
    return outputFile;
  } catch (error) {
    console.error("Failed to convert video:", error);
    throw new Error("视频转换失败");
  }
};

// 取消转换
export const cancelConversion = () => {
  // 重置FFmpeg实例来实现取消
  if (ffmpegInstance) {
    ffmpegInstance = null;
    console.log("Conversion cancelled");
  }
};
