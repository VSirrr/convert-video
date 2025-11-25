import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "sonner";
import {
  Upload,
  Settings,
  History,
  Moon,
  Sun,
  ChevronRight,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from "lucide-react";

// 导入FFmpeg服务
import {
  convertVideo,
  loadFFmpeg,
  cancelConversion as cancelFfmpegConversion,
} from "@/lib/ffmpegService";

// 视频格式选项
const VIDEO_FORMATS = [
  { id: "mp4", name: "MP4", description: "通用视频格式" },
  { id: "webm", name: "WebM", description: "网络视频格式" },
  { id: "avi", name: "AVI", description: "老式视频格式" },
  { id: "mov", name: "MOV", description: "Apple视频格式" },
  { id: "mkv", name: "MKV", description: "高清视频格式" },
];

// 分辨率选项
const RESOLUTIONS = [
  { id: "360p", name: "360p", description: "标清" },
  { id: "720p", name: "720p", description: "高清" },
  { id: "1080p", name: "1080p", description: "全高清" },
  { id: "2160p", name: "4K", description: "超高清" },
  { id: "original", name: "原始", description: "保持原分辨率" },
];

// 质量选项
const QUALITY_OPTIONS = [
  { id: "low", name: "低", value: 30 },
  { id: "medium", name: "中", value: 50 },
  { id: "high", name: "高", value: 70 },
  { id: "ultra", name: "超高", value: 90 },
  { id: "original", name: "原始", value: 100 },
];

// 帧率选项
const FRAME_RATES = [
  { id: "24", name: "24 FPS", description: "电影标准" },
  { id: "30", name: "30 FPS", description: "视频标准" },
  { id: "60", name: "60 FPS", description: "高流畅度" },
  { id: "original", name: "原始", description: "保持原帧率" },
];

// 转换历史记录类型
interface ConversionHistoryItem {
  id: string;
  fileName: string;
  originalFormat: string;
  targetFormat: string;
  status: "completed" | "failed" | "processing";
  timestamp: Date;
  duration?: number;
  fileSize?: string;
  convertedFile?: Blob; // 存储转换后的文件
}

const Home = () => {
  const { theme, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "settings" | "history">(
    "upload"
  );
  const [selectedFormat, setSelectedFormat] = useState("mp4");
  const [selectedResolution, setSelectedResolution] = useState("original");
  const [selectedQuality, setSelectedQuality] = useState("original");
  const [selectedFps, setSelectedFps] = useState("original");
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionHistory, setConversionHistory] = useState<
    ConversionHistoryItem[]
  >(() => {
    // 从localStorage加载历史记录
    const savedHistory = localStorage.getItem("conversionHistory");
    if (savedHistory) {
      try {
        return JSON.parse(savedHistory).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp),
        }));
      } catch (error) {
        console.error("Failed to load conversion history:", error);
        return [];
      }
    }
    return [];
  });
  const [isLoadingFFmpeg, setIsLoadingFFmpeg] = useState(false);

  useEffect(() => {
    return () => {
      cancelFfmpegConversion();
    };
  }, []);

  // 保存历史记录到localStorage（不包含文件数据）
  const saveHistoryToLocalStorage = (history: ConversionHistoryItem[]) => {
    // 移除file对象，因为它们不能被序列化
    const serializableHistory = history.map((item) => {
      const { convertedFile, ...rest } = item;
      return rest;
    });
    localStorage.setItem(
      "conversionHistory",
      JSON.stringify(serializableHistory)
    );
  };

  // 处理文件选择
  const handleFileSelect = (file: File) => {
    // 检查文件类型是否为视频
    if (
      !file.type.startsWith("video/") &&
      !file.name.toLowerCase().endsWith(".mkv")
    ) {
      toast.error("请选择有效的视频文件，支持MP4、WebM、AVI、MOV、MKV等格式");
      return;
    }

    setSelectedFile(file);
    toast.success(`已选择文件: ${file.name}`);

    // 自动切换到设置标签
    setActiveTab("settings");
  };

  // 处理拖放事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // 处理点击上传
  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  // 处理文件输入变化
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  // 更新转换进度
  const updateConversionProgress = (progress: number) => {
    setConversionProgress(progress);
  };

  // 开始转换
  const startConversion = async () => {
    setConversionProgress(0);
    if (!selectedFile) {
      toast.error("请先选择一个视频文件");
      return;
    }

    try {
      // 显示加载FFmpeg的提示
      setIsLoadingFFmpeg(true);
      toast.info("正在加载FFmpeg组件，首次使用可能需要较长时间...");

      // 加载FFmpeg
      const loaded = await loadFFmpeg();
      if (!loaded) {
        throw new Error("FFmpeg加载失败");
      }
      setIsLoadingFFmpeg(false);
      setIsConverting(true);

      // 获取质量值
      const qualityOption = QUALITY_OPTIONS.find(
        (q) => q.id === selectedQuality
      );
      const qualityValue = qualityOption ? qualityOption.value : 70;

      // 获取FPS值
      const fpsValue = selectedFps === "original" ? 0 : parseInt(selectedFps);

      // 创建新的历史记录项
      const newHistoryItem: ConversionHistoryItem = {
        id: `conv-${Date.now()}`,
        fileName: selectedFile.name,
        originalFormat: selectedFile.name.split(".").pop() || "unknown",
        targetFormat: selectedFormat,
        status: "processing",
        timestamp: new Date(),
      };

      // 添加到历史记录
      setConversionHistory((prev) => [newHistoryItem, ...prev]);
      saveHistoryToLocalStorage([newHistoryItem, ...conversionHistory]);

      // 执行实际的视频转换
      const startTime = Date.now();
      const convertedFile = await convertVideo(
        selectedFile,
        selectedFormat,
        selectedResolution,
        qualityValue,
        fpsValue,
        updateConversionProgress
      );

      // 更新进度为100%
      updateConversionProgress(100);

      // 计算转换持续时间
      const duration = Math.round((Date.now() - startTime) / 1000);

      // 更新历史记录项
      const updatedHistoryItem: ConversionHistoryItem = {
        ...newHistoryItem,
        status: "completed",
        duration,
        fileSize: `${(convertedFile.size / (1024 * 1024)).toFixed(2)} MB`,
        convertedFile, // 存储转换后的文件
      };

      // 更新历史记录
      setConversionHistory((prev) => {
        const updatedHistory = prev.map((item) =>
          item.id === newHistoryItem.id ? updatedHistoryItem : item
        );
        saveHistoryToLocalStorage(updatedHistory);
        return updatedHistory;
      });

      // 延迟一点时间再重置状态，让用户看到100%的进度
      setTimeout(() => {
        setIsConverting(false);
        setSelectedFile(null);
        toast.success("视频转换完成！");

        // 自动切换到历史标签
        setActiveTab("history");
      }, 1000);
    } catch (error) {
      console.error("视频转换失败:", error);
      setIsConverting(false);
      setIsLoadingFFmpeg(false);
      toast.error("视频转换失败，请重试");
    }
  };

  // 取消转换
  const cancelConversion = () => {
    cancelFfmpegConversion();
    setIsConverting(false);
    setConversionProgress(0);
    setSelectedFile(null);
    toast.info("转换已取消");
  };

  // 格式化时间
  const formatTime = (date: Date) => {
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // 下载转换后的文件
  const downloadFile = (item: ConversionHistoryItem) => {
    if (!item.convertedFile) {
      return;
    }
    // 在实际应用中，我们应该从后端获取文件，或者在前端使用保存的文件
    // 这里我们创建一个简单的下载链接
    const fileName = `${item.fileName.replace(/\.[^/.]+$/, "")}.${
      item.targetFormat
    }`;
    const fileUrl = URL.createObjectURL(
      new Blob([item.convertedFile], { type: `video/${item.targetFormat}` })
    );

    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 清理URL对象
    URL.revokeObjectURL(fileUrl);

    toast.success(`正在下载: ${fileName}`);
  };

  // 重试转换
  const retryConversion = (item: ConversionHistoryItem) => {
    toast.info(`准备重新转换: ${item.fileName}`);
    setActiveTab("upload");
  };

  // 格式化持续时间
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  };

  return (
    <div
      className={`min-h-screen flex flex-col ${
        theme === "dark" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-900"
      } transition-colors duration-300`}
    >
      {/* 顶部导航栏 */}
      <header
        className={`sticky top-0 z-10 ${
          theme === "dark" ? "bg-gray-800" : "bg-white"
        } shadow-md transition-colors duration-300`}
      >
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <motion.div
              initial={{ rotate: 0 }}
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="text-blue-500"
            >
              <RefreshCw size={24} />
            </motion.div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-500 to-purple-600">
              VideoTranscoder
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-full ${
                theme === "dark"
                  ? "bg-gray-700 text-yellow-300"
                  : "bg-gray-200 text-gray-700"
              } hover:opacity-80 transition-opacity`}
              aria-label="切换主题"
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* 主内容区域 */}
      <main className="flex-grow container mx-auto px-4 py-8">
        {/* 标签导航 */}
        <div className="flex flex-wrap gap-2 mb-8">
          {[
            { id: "upload", label: "上传文件", icon: <Upload size={18} /> },
            { id: "settings", label: "转换设置", icon: <Settings size={18} /> },
            { id: "history", label: "转换历史", icon: <History size={18} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(tab.id as "upload" | "settings" | "history")
              }
              className={`flex items-center space-x-2 px-4 py-2 rounded-full transition-all ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-blue-900"
                  : theme === "dark"
                  ? "bg-gray-800 hover:bg-gray-700"
                  : "bg-white hover:bg-gray-100"
              }`}
              disabled={isConverting || isLoadingFFmpeg}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* 上传标签内容 */}
        {activeTab === "upload" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* 上传区域 */}
            <div
              className={`lg:col-span-2 ${
                theme === "dark" ? "bg-gray-800" : "bg-white"
              } rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center h-[500px] relative overflow-hidden`}
            >
              <div
                className={`absolute inset-0 border-2 border-dashed transition-colors ${
                  isDragging
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : theme === "dark"
                    ? "border-gray-700 hover:border-blue-500"
                    : "border-gray-300 hover:border-blue-500"
                } rounded-2xl`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleClickUpload}
                style={{
                  cursor:
                    isConverting || isLoadingFFmpeg ? "not-allowed" : "pointer",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={isConverting || isLoadingFFmpeg}
                />

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                  <motion.div
                    animate={{ scale: isDragging ? 1.1 : 1 }}
                    transition={{ duration: 0.2 }}
                    className="text-blue-500 mb-4"
                  >
                    <Upload size={64} />
                  </motion.div>
                  <h2 className="text-2xl font-bold mb-2">
                    拖放视频文件到此处
                  </h2>
                  <p
                    className={`mb-6 max-w-md ${
                      theme === "dark" ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    或者点击上传，支持 MP4、WebM、AVI、MOV、MKV 等常见视频格式
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-medium flex items-center space-x-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isConverting && !isLoadingFFmpeg) {
                        handleClickUpload();
                      }
                    }}
                    disabled={isConverting || isLoadingFFmpeg}
                    style={{
                      opacity: isConverting || isLoadingFFmpeg ? 0.6 : 1,
                    }}
                  >
                    <span>选择文件</span>
                    <ChevronRight size={18} />
                  </motion.button>
                </div>
              </div>
            </div>

            {/* 功能介绍 */}
            <div
              className={`${
                theme === "dark" ? "bg-gray-800" : "bg-white"
              } rounded-2xl shadow-lg p-6`}
            >
              <h3 className="text-xl font-bold mb-4">
                为什么选择我们的视频转换工具？
              </h3>
              <ul className="space-y-4">
                {[
                  {
                    title: "高质量转换",
                    desc: "基于FFmpeg内核，保持视频原有质量，支持多种分辨率选择",
                  },
                  {
                    title: "真实转换",
                    desc: "使用FFmpeg.wasm在浏览器中进行真实的视频格式转换",
                  },
                  {
                    title: "安全可靠",
                    desc: "所有转换均在您的浏览器中进行，保护您的隐私",
                  },
                  { title: "多种格式", desc: "支持主流视频格式的相互转换" },
                  { title: "完全免费", desc: "无需注册，无使用限制，完全免费" },
                ].map((feature, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start space-x-3"
                  >
                    <div className="mt-1 text-blue-500">
                      <CheckCircle size={18} />
                    </div>
                    <div>
                      <h4 className="font-semibold">{feature.title}</h4>
                      <p
                        className={`text-sm ${
                          theme === "dark" ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {feature.desc}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </ul>

              {/* FFmpeg提示 */}
              <div
                className={`mt-6 p-4 rounded-xl ${
                  theme === "dark"
                    ? "bg-blue-900/20 text-blue-300"
                    : "bg-blue-50 text-blue-800"
                } flex items-start space-x-3`}
              >
                <AlertTriangle size={18} className="mt-1 flex-shrink-0" />
                <p className="text-sm">
                  首次使用时，系统会下载FFmpeg组件，可能需要一些时间，请耐心等待。
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* 设置标签内容 */}
        {activeTab === "settings" && selectedFile && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            {/* 文件信息 */}
            <div
              className={`${
                theme === "dark" ? "bg-gray-800" : "bg-white"
              } rounded-2xl shadow-lg p-6`}
            >
              <h3 className="text-xl font-bold mb-4">文件信息</h3>
              <div
                className={`w-full h-40 ${
                  theme === "dark" ? "bg-gray-700" : "bg-gray-100"
                } rounded-xl flex items-center justify-center mb-4`}
              >
                <i className="fa-solid fa-film text-4xl text-blue-500"></i>
              </div>
              <ul className="space-y-2">
                <li className="flex justify-between">
                  <span
                    className={`${
                      theme === "dark" ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    文件名:
                  </span>
                  <span
                    className="font-medium truncate"
                    title={selectedFile.name}
                  >
                    {selectedFile.name}
                  </span>
                </li>
                <li className="flex justify-between">
                  <span
                    className={`${
                      theme === "dark" ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    大小:
                  </span>
                  <span>
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </li>
                <li className="flex justify-between">
                  <span
                    className={`${
                      theme === "dark" ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    格式:
                  </span>
                  <span>{selectedFile.name.split(".").pop()}</span>
                </li>
              </ul>
            </div>

            {/* 转换设置 */}
            <div
              className={`lg:col-span-2 ${
                theme === "dark" ? "bg-gray-800" : "bg-white"
              } rounded-2xl shadow-lg p-6`}
            >
              <h3 className="text-xl font-bold mb-6">转换设置</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* 输出格式 */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    输出格式
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {VIDEO_FORMATS.map((format) => (
                      <button
                        key={format.id}
                        onClick={() => setSelectedFormat(format.id)}
                        className={`p-3 rounded-xl text-left transition-all ${
                          selectedFormat === format.id
                            ? "bg-blue-500 text-white shadow-md"
                            : theme === "dark"
                            ? "bg-gray-700 hover:bg-gray-600"
                            : "bg-gray-100 hover:bg-gray-200"
                        }`}
                        disabled={isConverting || isLoadingFFmpeg}
                      >
                        <div className="font-bold">{format.name}</div>
                        <div className="text-xs opacity-80">
                          {format.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 分辨率 */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    分辨率
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {RESOLUTIONS.map((resolution) => (
                      <button
                        key={resolution.id}
                        onClick={() => setSelectedResolution(resolution.id)}
                        className={`p-3 rounded-xl text-left transition-all ${
                          selectedResolution === resolution.id
                            ? "bg-blue-500 text-white shadow-md"
                            : theme === "dark"
                            ? "bg-gray-700 hover:bg-gray-600"
                            : "bg-gray-100 hover:bg-gray-200"
                        }`}
                        disabled={isConverting || isLoadingFFmpeg}
                      >
                        <div className="font-bold">{resolution.name}</div>
                        <div className="text-xs opacity-80">
                          {resolution.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 视频质量 */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    视频质量
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITY_OPTIONS.map((quality) => (
                      <button
                        key={quality.id}
                        onClick={() => setSelectedQuality(quality.id)}
                        className={`p-3 rounded-xl text-left transition-all ${
                          selectedQuality === quality.id
                            ? "bg-blue-500 text-white shadow-md"
                            : theme === "dark"
                            ? "bg-gray-700 hover:bg-gray-600"
                            : "bg-gray-100 hover:bg-gray-200"
                        }`}
                        disabled={isConverting || isLoadingFFmpeg}
                      >
                        <div className="font-bold">{quality.name}</div>
                        {quality.id !== "original" && (
                          <div className="text-xs opacity-80">
                            {quality.value}%
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 帧率 */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    帧率 (FPS)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {FRAME_RATES.map((fps) => (
                      <button
                        key={fps.id}
                        onClick={() => setSelectedFps(fps.id)}
                        className={`p-3 rounded-xl text-left transition-all ${
                          selectedFps === fps.id
                            ? "bg-blue-500 text-white shadow-md"
                            : theme === "dark"
                            ? "bg-gray-700 hover:bg-gray-600"
                            : "bg-gray-100 hover:bg-gray-200"
                        }`}
                        disabled={isConverting || isLoadingFFmpeg}
                      >
                        <div className="font-bold">{fps.name}</div>
                        {fps.id !== "original" && (
                          <div className="text-xs opacity-80">
                            {fps.description}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 转换按钮 */}
              <div className="flex flex-col sm:flex-row gap-4 justify-end">
                <button
                  onClick={cancelConversion}
                  className={`px-6 py-3 rounded-full font-medium ${
                    theme === "dark"
                      ? "bg-gray-700 hover:bg-gray-600"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                  disabled={isLoadingFFmpeg && !isConverting}
                >
                  取消
                </button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={startConversion}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium flex items-center justify-center space-x-2"
                  disabled={isConverting || isLoadingFFmpeg}
                >
                  <RefreshCw size={18} />
                  <span>开始转换</span>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* 没有选择文件时的设置页面 */}
        {activeTab === "settings" && !selectedFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`${
              theme === "dark" ? "bg-gray-800" : "bg-white"
            } rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center h-[500px]`}
          >
            <div className="text-6xl text-blue-500 mb-4">
              <Upload />
            </div>
            <h3 className="text-xl font-bold mb-2">请先上传一个视频文件</h3>
            <p
              className={`mb-6 text-center max-w-md ${
                theme === "dark" ? "text-gray-400" : "text-gray-600"
              }`}
            >
              您需要先上传一个视频文件，然后才能进行转换设置
            </p>
            <button
              onClick={() => setActiveTab("upload")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-medium flex items-center space-x-2"
              disabled={isConverting || isLoadingFFmpeg}
            >
              <span>前往上传</span>
              <ChevronRight size={18} />
            </button>
          </motion.div>
        )}

        {/* 历史标签内容 */}
        {activeTab === "history" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {conversionHistory.length === 0 ? (
              <div
                className={`${
                  theme === "dark" ? "bg-gray-800" : "bg-white"
                } rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center h-[500px]`}
              >
                <div className="text-6xl text-blue-500 mb-4">
                  <History />
                </div>
                <h3 className="text-xl font-bold mb-2">暂无转换历史</h3>
                <p
                  className={`mb-6 text-center max-w-md ${
                    theme === "dark" ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  当您完成视频转换后，历史记录将显示在这里
                </p>
                <button
                  onClick={() => setActiveTab("upload")}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-full font-medium flex items-center space-x-2"
                  disabled={isConverting || isLoadingFFmpeg}
                >
                  <span>开始转换</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            ) : (
              <div
                className={`${
                  theme === "dark" ? "bg-gray-800" : "bg-white"
                } rounded-2xl shadow-lg p-6`}
              >
                <h3 className="text-xl font-bold mb-6">转换历史</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr
                        className={`border-b ${
                          theme === "dark"
                            ? "border-gray-700"
                            : "border-gray-200"
                        }`}
                      >
                        <th className="py-3 text-left font-semibold">文件名</th>
                        <th className="py-3 text-left font-semibold">格式</th>
                        <th className="py-3 text-left font-semibold">状态</th>
                        <th className="py-3 text-left font-semibold">时间</th>
                        <th className="py-3 text-left font-semibold">大小</th>
                        <th className="py-3 text-left font-semibold">耗时</th>
                        <th className="py-3 text-right font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conversionHistory.map((item) => (
                        <tr
                          key={item.id}
                          className={`border-b ${
                            theme === "dark"
                              ? "border-gray-700"
                              : "border-gray-200"
                          }`}
                        >
                          <td className="py-4">
                            <div className="font-medium" title={item.fileName}>
                              {item.fileName}
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="text-sm">
                              {item.originalFormat} → {item.targetFormat}
                            </div>
                          </td>
                          <td className="py-4">
                            <div
                              className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                                item.status === "completed"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                  : item.status === "failed"
                                  ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                              }`}
                            >
                              {item.status === "completed" && (
                                <CheckCircle size={14} className="mr-1" />
                              )}
                              {item.status === "failed" && (
                                <XCircle size={14} className="mr-1" />
                              )}
                              {item.status === "processing" && (
                                <RefreshCw
                                  size={14}
                                  className="mr-1 animate-spin"
                                />
                              )}
                              {item.status === "completed"
                                ? "已完成"
                                : item.status === "failed"
                                ? "失败"
                                : "处理中"}
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="text-sm">
                              {formatTime(item.timestamp)}
                            </div>
                          </td>
                          <td className="py-4">
                            <div className="text-sm">
                              {item.fileSize || "-"}
                            </div>
                          </td>
                          <td className="py-4">
                            {item.duration ? (
                              <div className="text-sm flex items-center">
                                <Clock size={14} className="mr-1 inline" />
                                {formatDuration(item.duration)}
                              </div>
                            ) : (
                              <div className="text-sm">-</div>
                            )}
                          </td>
                          <td className="py-4 text-right">
                            {item.status === "completed" ? (
                              <button
                                onClick={() => downloadFile(item)}
                                className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
                                aria-label="下载文件"
                              >
                                <Download size={18} />
                              </button>
                            ) : item.status === "failed" ? (
                              <button
                                onClick={() => retryConversion(item)}
                                className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-300"
                                aria-label="重试"
                              >
                                <RefreshCw size={18} />
                              </button>
                            ) : (
                              <span className="animate-spin text-blue-500">
                                <RefreshCw size={18} />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* 转换进度弹窗 */}
        {isConverting && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          >
            <div
              className={`${
                theme === "dark" ? "bg-gray-800" : "bg-white"
              } rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4`}
            >
              <h3 className="text-xl font-bold mb-4">正在转换视频</h3>
              <div className="mb-6">
                <div className="flex justify-between mb-2">
                  <span>{selectedFile?.name}</span>
                  <span>{Math.round(conversionProgress)}%</span>
                </div>
                <div
                  className={`h-3 rounded-full overflow-hidden ${
                    theme === "dark" ? "bg-gray-700" : "bg-gray-200"
                  }`}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${conversionProgress}%` }}
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={cancelConversion}
                  className={`px-6 py-2 rounded-full font-medium ${
                    theme === "dark"
                      ? "bg-gray-700 hover:bg-gray-600"
                      : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  取消
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* FFmpeg加载弹窗 */}
        {isLoadingFFmpeg && !isConverting && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          >
            <div
              className={`${
                theme === "dark" ? "bg-gray-800" : "bg-white"
              } rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4`}
            >
              <h3 className="text-xl font-bold mb-4 flex items-center">
                <RefreshCw size={20} className="mr-2 animate-spin" />
                正在加载FFmpeg
              </h3>
              <p
                className={`mb-6 ${
                  theme === "dark" ? "text-gray-400" : "text-gray-600"
                }`}
              >
                首次使用需要下载FFmpeg组件，这可能需要一些时间，请耐心等待...
              </p>
            </div>
          </motion.div>
        )}
      </main>

      {/* 页脚 */}
      <footer
        className={`${
          theme === "dark"
            ? "bg-gray-800 text-gray-400"
            : "bg-white text-gray-600"
        } py-6 border-t ${
          theme === "dark" ? "border-gray-700" : "border-gray-200"
        }`}
      >
        <div className="container mx-auto px-4 text-center">
          <p>VideoTranscoder - 专业、免费的在线视频转换工具</p>
          <p className="text-sm mt-2">
            © 2025 VideoTranscoder. 基于FFmpeg.wasm技术，所有处理均在本地完成。
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
