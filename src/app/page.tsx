"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Search,
  Link2,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  ArrowRight,
  AlertCircle,
  Film,
  KeyRound,
  Eye,
  EyeOff,
  FileVideo,
  Upload,
  X,
} from "lucide-react";

type Mode = "url" | "search" | "mediainfo";
type SearchSource = "douban" | "imdb" | "tmdb";

interface SearchResult {
  title: string;
  subtitle?: string;
  year?: string;
  subtype?: string;
  link?: string;
  rating?: string;
  id?: string;
}

interface ApiResponse {
  success: boolean;
  error?: string;
  format?: string;
  data?: SearchResult[];
  need_key?: boolean;
  [key: string]: unknown;
}

const SOURCES: { value: SearchSource; label: string; accent: string }[] = [
  // { value: "douban", label: "豆瓣", accent: "#16a34a" },
  { value: "imdb", label: "IMDb", accent: "#ca8a04" },
  { value: "tmdb", label: "TMDB", accent: "#0891b2" },
];

const EXAMPLE_URLS = [
  { url: "https://movie.douban.com/subject/1292052/", label: "豆瓣" },
  { url: "https://www.imdb.com/title/tt0111161/", label: "IMDb" },
  { url: "https://www.themoviedb.org/movie/278", label: "TMDB" },
  { url: "https://bgm.tv/subject/253395", label: "Bangumi" },
  { url: "https://store.steampowered.com/app/1174180/", label: "Steam" },
];

const STORAGE_KEY = "ptgen_api_key";

export default function Home() {
  const [mode, setMode] = useState<Mode>("url");
  const [input, setInput] = useState("");
  const [source, setSource] = useState<SearchSource>("imdb");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyVisible, setKeyVisible] = useState(false);
  const [miOutput, setMiOutput] = useState("");
  const [miLoading, setMiLoading] = useState(false);
  const [miCopied, setMiCopied] = useState(false);
  const [miFileName, setMiFileName] = useState("");
  const [miDragOver, setMiDragOver] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setApiKey(saved);
  }, []);

  // Save API key
  const saveApiKey = useCallback((key: string) => {
    setApiKey(key);
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const loadMediaInfo = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).MediaInfo) return (window as any).MediaInfo;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/mediainfo.min.js";
      script.onload = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mi = (window as any).MediaInfo;
        if (mi) resolve(mi);
        else reject(new Error("MediaInfo failed to load"));
      };
      script.onerror = () => reject(new Error("Failed to load mediainfo.js"));
      document.head.appendChild(script);
    });
  }, []);

  const analyzeFile = useCallback(async (file: File) => {
    setMiLoading(true);
    setMiOutput("");
    setMiFileName(file.name);
    setMiCopied(false);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const MediaInfoModule = await loadMediaInfo() as any;
      const mediaInfoFactory = MediaInfoModule.default || MediaInfoModule.mediaInfoFactory || MediaInfoModule;
      const mi = await mediaInfoFactory({
        locateFile: () => "/MediaInfoModule.wasm",
        format: "text",
      });
      const readChunk = async (chunkSize: number, offset: number) => {
        const buf = await file.slice(offset, offset + chunkSize).arrayBuffer();
        return new Uint8Array(buf);
      };
      const result = await mi.analyzeData(file.size, readChunk);
      setMiOutput(typeof result === "string" ? result : JSON.stringify(result, null, 2));
      mi.close();
    } catch (err: unknown) {
      setMiOutput(`解析失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setMiLoading(false);
    }
  }, [loadMediaInfo]);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setMiDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) analyzeFile(file);
  }, [analyzeFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) analyzeFile(file);
    e.target.value = "";
  }, [analyzeFile]);

  const copyMiOutput = useCallback(async () => {
    if (!miOutput) return;
    try {
      await navigator.clipboard.writeText(miOutput);
      setMiCopied(true);
      setTimeout(() => setMiCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = miOutput;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setMiCopied(true);
      setTimeout(() => setMiCopied(false), 2000);
    }
  }, [miOutput]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showSourceMenu) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowSourceMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSourceMenu]);

  const buildParams = useCallback(
    (extra: Record<string, string>) => {
      const params = new URLSearchParams(extra);
      if (apiKey) params.set("key", apiKey);
      return params;
    },
    [apiKey]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || loading) return;

      setLoading(true);
      setResult(null);
      setCopied(false);

      try {
        const extra: Record<string, string> =
          mode === "url"
            ? { url: trimmed }
            : { source, query: trimmed };
        const params = buildParams(extra);
        const resp = await fetch(`/api?${params.toString()}`);
        const data: ApiResponse = await resp.json();
        if (data.need_key) setShowKeyInput(true);
        setResult(data);
      } catch (err: unknown) {
        setResult({
          success: false,
          error: err instanceof Error ? err.message : "网络错误",
        });
      } finally {
        setLoading(false);
      }
    },
    [input, mode, source, loading, buildParams]
  );

  const handleSearchResultClick = useCallback(
    async (link: string) => {
      if (!link || loading) return;
      setInput(link);
      setMode("url");
      setLoading(true);
      setResult(null);
      setCopied(false);

      try {
        const params = buildParams({ url: link });
        const resp = await fetch(`/api?${params.toString()}`);
        const data: ApiResponse = await resp.json();
        if (data.need_key) setShowKeyInput(true);
        setResult(data);
      } catch (err: unknown) {
        setResult({
          success: false,
          error: err instanceof Error ? err.message : "网络错误",
        });
      } finally {
        setLoading(false);
      }
    },
    [loading, buildParams]
  );

  const copyToClipboard = useCallback(async () => {
    if (!result?.format) return;
    try {
      await navigator.clipboard.writeText(result.format);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = result.format;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  const currentSource = SOURCES.find((s) => s.value === source)!;
  const hasSearchResults =
    result?.data && Array.isArray(result.data) && result.data.length > 0;
  const hasFormat = result?.format && typeof result.format === "string";

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/85 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="w-5 h-5 text-accent" strokeWidth={1.5} />
            <span
              className="text-lg tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              PT-Gen
            </span>
            <span className="text-[9px] uppercase tracking-[0.15em] text-muted-light bg-surface-alt border border-border px-1.5 py-0.5 rounded-sm font-medium">
              Next
            </span>
          </div>
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            className={`flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-lg border transition-all ${
              apiKey
                ? "border-green-200 text-green-700 bg-green-50 hover:bg-green-100"
                : "border-border text-muted hover:text-foreground hover:bg-surface-alt"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" strokeWidth={1.5} />
            {apiKey ? "已认证" : "设置密钥"}
          </button>
        </div>
      </header>

      {/* API Key Panel */}
      {showKeyInput && (
        <div className="border-b border-border bg-surface-alt animate-fade-in">
          <div className="max-w-3xl mx-auto px-6 py-4">
            <div className="flex items-center gap-3">
              <label className="text-[12px] text-muted font-medium shrink-0">
                API 密钥
              </label>
              <div className="flex-1 relative">
                <input
                  type={keyVisible ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => saveApiKey(e.target.value)}
                  placeholder="输入 API Key 以访问服务"
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 pr-10 text-[13px] text-foreground placeholder:text-muted-light outline-none focus:border-border-strong transition-colors"
                  style={{ fontFamily: "var(--font-code)" }}
                />
                <button
                  type="button"
                  onClick={() => setKeyVisible(!keyVisible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-light hover:text-muted transition-colors"
                >
                  {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {apiKey && (
                <button
                  onClick={() => saveApiKey("")}
                  className="text-[11px] text-red-500 hover:text-red-700 transition-colors shrink-0"
                >
                  清除
                </button>
              )}
            </div>
            <p className="text-[11px] text-muted-light mt-2">
              密钥会保存在浏览器本地，不会上传到其他地方。
            </p>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-6 pt-20 pb-32">
        <div className="w-full max-w-xl">
          {/* Hero */}
          <div className="text-center mb-14 animate-fade-up">
            <h1
              className="text-4xl tracking-tight text-foreground mb-3 leading-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              媒体信息生成器
            </h1>
            <p className="text-sm text-muted leading-relaxed max-w-sm mx-auto">
              粘贴链接或搜索标题，生成格式化的媒体描述信息
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="flex gap-0 mb-5 border-b border-border animate-fade-up stagger-1">
            <button
              onClick={() => { setMode("url"); setResult(null); }}
              className={`flex items-center gap-2 px-4 pb-2.5 text-[13px] font-medium border-b-2 transition-all -mb-px ${
                mode === "url"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Link2 className="w-4 h-4" strokeWidth={1.5} />
              链接生成
            </button>
            <button
              onClick={() => { setMode("search"); setResult(null); }}
              className={`flex items-center gap-2 px-4 pb-2.5 text-[13px] font-medium border-b-2 transition-all -mb-px ${
                mode === "search"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Search className="w-4 h-4" strokeWidth={1.5} />
              搜索
            </button>
            <button
              onClick={() => { setMode("mediainfo"); setResult(null); }}
              className={`flex items-center gap-2 px-4 pb-2.5 text-[13px] font-medium border-b-2 transition-all -mb-px ${
                mode === "mediainfo"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <FileVideo className="w-4 h-4" strokeWidth={1.5} />
              MediaInfo
            </button>
          </div>

          {/* MediaInfo Section */}
          {mode === "mediainfo" && (
            <div className="animate-fade-up stagger-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                accept="video/*,audio/*,.mkv,.avi,.mp4,.flv,.rmvb,.wmv,.ts,.m2ts,.flac,.ape,.wav,.m4a"
              />
              <div
                onDragOver={(e) => { e.preventDefault(); setMiDragOver(true); }}
                onDragLeave={() => setMiDragOver(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`mb-8 border-2 border-dashed rounded-xl px-6 py-12 text-center cursor-pointer transition-all ${
                  miDragOver
                    ? "border-accent bg-accent-light/50"
                    : "border-border hover:border-border-strong hover:bg-surface-alt/50"
                }`}
              >
                {miLoading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-accent animate-spin" />
                    <p className="text-sm text-muted">正在解析 {miFileName}...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-8 h-8 text-muted-light" strokeWidth={1.5} />
                    <div>
                      <p className="text-sm text-foreground font-medium">拖放媒体文件到此处</p>
                      <p className="text-[12px] text-muted mt-1">或点击选择文件 · 纯本地解析，文件不会上传</p>
                    </div>
                  </div>
                )}
              </div>

              {miOutput && (
                <div className="animate-fade-up">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-light font-medium">
                        MediaInfo
                      </p>
                      {miFileName && (
                        <span className="text-[11px] text-muted bg-surface-alt border border-border rounded px-2 py-0.5 max-w-60 truncate">
                          {miFileName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setMiOutput(""); setMiFileName(""); }}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] text-muted hover:text-foreground border border-border hover:border-border-strong hover:bg-surface-alt transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                        清除
                      </button>
                      <button
                        onClick={copyMiOutput}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
                          miCopied
                            ? "border-green-300 text-green-700 bg-green-50"
                            : "border-border text-muted hover:text-foreground hover:border-border-strong hover:bg-surface-alt"
                        }`}
                      >
                        {miCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {miCopied ? "已复制" : "复制"}
                      </button>
                    </div>
                  </div>
                  <div className="relative bg-surface-alt border border-border rounded-xl overflow-hidden">
                    <pre
                      className="p-5 text-[12px] leading-[1.8] text-foreground overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-150 overflow-y-auto"
                      style={{ fontFamily: "var(--font-code)" }}
                    >
                      {miOutput}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input Form */}
          {mode !== "mediainfo" && (
          <form onSubmit={handleSubmit} className="relative mb-8 animate-fade-up stagger-2">
            <div
              className={`flex items-center gap-3 bg-surface border rounded-xl px-4 py-3 shadow-sm transition-all ${
                loading
                  ? "border-accent/30"
                  : "border-border focus-within:border-border-strong focus-within:shadow-md"
              }`}
            >
              {mode === "search" && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowSourceMenu(!showSourceMenu)}
                    className="flex items-center gap-1.5 text-[13px] font-medium px-2.5 py-1 rounded-md border border-border hover:bg-surface-alt transition-colors"
                    style={{ color: currentSource.accent }}
                  >
                    {currentSource.label}
                    <ChevronDown className="w-3.5 h-3.5 opacity-50" />
                  </button>
                  {showSourceMenu && (
                    <div className="absolute top-full left-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-999 py-1.5 min-w-28 overflow-hidden">
                      {SOURCES.map((s) => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => { setSource(s.value); setShowSourceMenu(false); }}
                          className={`w-full text-left px-3.5 py-2 text-[13px] transition-colors hover:bg-surface-alt ${
                            source === s.value ? "font-medium" : ""
                          }`}
                          style={source === s.value ? { color: s.accent } : {}}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  mode === "url"
                    ? "粘贴豆瓣、IMDb、TMDB、Bangumi、Steam 等链接..."
                    : `在${currentSource.label}上搜索...`
                }
                className="flex-1 bg-transparent outline-none text-[14px] text-foreground placeholder:text-muted-light"
                disabled={loading}
              />

              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-25 disabled:cursor-not-allowed bg-foreground text-background hover:bg-foreground/85 active:scale-[0.97]"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" strokeWidth={2} />
                )}
              </button>
            </div>

            {/* Loading indicator */}
            {loading && (
              <div className="absolute -bottom-1 left-4 right-4 h-0.5 rounded-full overflow-hidden">
                <div className="h-full animate-shimmer rounded-full" />
              </div>
            )}
          </form>
          )}

          {/* Example URLs */}
          {mode === "url" && !result && !loading && (
            <div className="animate-fade-up stagger-3 mb-10">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-light mb-3 font-medium">
                试试这些
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_URLS.map((ex, i) => (
                  <button
                    key={ex.url}
                    onClick={() => setInput(ex.url)}
                    className={`text-[12px] text-muted hover:text-accent px-3 py-1.5 rounded-lg border border-border hover:border-accent/30 hover:bg-accent-light/40 transition-all stagger-${i + 1}`}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {result && !result.success && result.error && !hasSearchResults && (
            <div className="animate-fade-in mb-8">
              <div className={`border rounded-xl px-4 py-3.5 ${
                result.need_key
                  ? "bg-amber-50 border-amber-200"
                  : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-start gap-2.5">
                  {result.need_key ? (
                    <KeyRound className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <p className={`text-[13px] leading-relaxed ${
                      result.need_key ? "text-amber-800" : "text-red-700"
                    }`}>
                      {result.error}
                    </p>
                    {result.need_key && !showKeyInput && (
                      <button
                        onClick={() => setShowKeyInput(true)}
                        className="text-[12px] text-amber-700 underline underline-offset-2 mt-1 hover:text-amber-900 transition-colors"
                      >
                        点击设置 API 密钥
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Search Results */}
          {hasSearchResults && (
            <div className="animate-fade-in mb-8">
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-light mb-4 font-medium">
                找到 {result!.data!.length} 条结果
              </p>
              <div className="space-y-2">
                {result!.data!.map((item, i) => (
                  <button
                    key={`${item.id || item.link}-${i}`}
                    onClick={() => item.link && handleSearchResultClick(item.link)}
                    disabled={!item.link || loading}
                    className="w-full text-left group bg-surface border border-border hover:border-border-strong rounded-xl px-5 py-3.5 transition-all hover:shadow-sm disabled:opacity-35"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2.5 mb-0.5">
                          <span className="text-[14px] text-foreground truncate font-medium leading-snug">
                            {item.title || "未知标题"}
                          </span>
                          {item.year && (
                            <span className="text-[11px] text-muted-light shrink-0 tabular-nums">
                              {item.year}
                            </span>
                          )}
                          {item.subtype && (
                            <span className="text-[10px] text-muted-light border border-border rounded px-1.5 py-0.5 shrink-0 uppercase tracking-wider">
                              {item.subtype}
                            </span>
                          )}
                        </div>
                        {item.subtitle && (
                          <p className="text-[12px] text-muted truncate leading-relaxed">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-light group-hover:text-accent shrink-0 transition-all group-hover:translate-x-0.5" strokeWidth={1.5} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Formatted Output */}
          {hasFormat && (
            <div className="animate-fade-up">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-light font-medium">
                  生成结果
                </p>
                <button
                  onClick={copyToClipboard}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all border ${
                    copied
                      ? "border-green-300 text-green-700 bg-green-50"
                      : "border-border text-muted hover:text-foreground hover:border-border-strong hover:bg-surface-alt"
                  }`}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copied ? "已复制" : "复制"}
                </button>
              </div>
              <div className="relative bg-surface-alt border border-border rounded-xl overflow-hidden">
                <pre
                  ref={outputRef}
                  className="p-5 text-[12px] leading-[1.8] text-foreground overflow-x-auto whitespace-pre-wrap wrap-break-word max-h-150 overflow-y-auto"
                  style={{ fontFamily: "var(--font-code)" }}
                >
                  {result!.format}
                </pre>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-5">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between text-[11px] text-muted-light">
          <span>
            PT-Gen Next{" "}
            <span className="text-muted">·</span>{" "}
            <span className="tabular-nums">v1.0</span>
          </span>
          <span>基于 Next.js 构建</span>
        </div>
      </footer>
    </div>
  );
}
