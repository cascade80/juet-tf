"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { ArrowRight, Play, Menu, X } from "lucide-react";
import Lenis from "lenis";

const TOTAL_SCROLL_FRAMES = 234;

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Home");
  const [scrollProgress, setScrollProgress] = useState(0);
  const [firstFrameLoaded, setFirstFrameLoaded] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<(HTMLImageElement | null)[]>([]);
  const targetFrameRef = useRef<number>(1);
  const currentFrameRef = useRef<number>(1);
  const lastRenderedFrameRef = useRef<number>(-1);
  const rafIdRef = useRef<number | null>(null);
  const isReducedMotionRef = useRef<boolean>(false);

  const navLinks = [
    { name: "Home", href: "#" },
    { name: "Events", href: "#events" },
    { name: "Timeline", href: "#timeline" },
    { name: "Gallery", href: "#gallery" },
    { name: "Sponsors", href: "#sponsors" },
    { name: "Contact", href: "#contact" },
  ];

  const getFrameSrc = (index: number) => {
    const padded = String(index).padStart(3, "0");
    return `/frames-webp/frame-${padded}.webp`;
  };

  // Find nearest loaded frame to ensure zero flickering or blank flashes
  const findNearestLoadedImage = useCallback((targetIndex: number) => {
    if (imagesRef.current[targetIndex]?.complete && imagesRef.current[targetIndex]?.naturalWidth) {
      return imagesRef.current[targetIndex];
    }
    // Search outwards from targetIndex
    for (let offset = 1; offset <= TOTAL_SCROLL_FRAMES; offset++) {
      const prev = targetIndex - offset;
      if (prev >= 1 && imagesRef.current[prev]?.complete && imagesRef.current[prev]?.naturalWidth) {
        return imagesRef.current[prev];
      }
      const next = targetIndex + offset;
      if (next <= TOTAL_SCROLL_FRAMES && imagesRef.current[next]?.complete && imagesRef.current[next]?.naturalWidth) {
        return imagesRef.current[next];
      }
    }
    return null;
  }, []);

  // Draw frame to canvas maintaining full cover aspect ratio and DPR
  const renderFrame = useCallback(
    (frameIndex: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return;

      const img = findNearestLoadedImage(frameIndex);
      if (!img) return;

      const width = canvas.width;
      const height = canvas.height;

      const imgRatio = img.naturalWidth / img.naturalHeight;
      const canvasRatio = width / height;

      let drawWidth = width;
      let drawHeight = height;
      let offsetX = 0;
      let offsetY = 0;

      if (canvasRatio > imgRatio) {
        drawWidth = width;
        drawHeight = width / imgRatio;
        offsetY = (height - drawHeight) / 2;
      } else {
        drawHeight = height;
        drawWidth = height * imgRatio;
        offsetX = (width - drawWidth) / 2;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    },
    [findNearestLoadedImage]
  );

  // Resize handler supporting high-DPI displays
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const displayWidth = window.innerWidth;
    const displayHeight = window.innerHeight;

    canvas.width = Math.floor(displayWidth * dpr);
    canvas.height = Math.floor(displayHeight * dpr);
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    const frameToRender = Math.min(
      Math.max(Math.round(currentFrameRef.current), 1),
      TOTAL_SCROLL_FRAMES
    );
    renderFrame(frameToRender);
  }, [renderFrame]);

  // Load a single frame on-demand if not already loaded
  const loadSingleFrame = useCallback((frameNum: number) => {
    if (frameNum < 1 || frameNum > TOTAL_SCROLL_FRAMES) return;
    if (imagesRef.current[frameNum]) return;

    const img = new window.Image();
    img.src = getFrameSrc(frameNum);
    imagesRef.current[frameNum] = img;
    img.onload = () => {
      if (Math.round(currentFrameRef.current) === frameNum) {
        renderFrame(frameNum);
      }
    };
  }, [renderFrame]);

  // Priority window loading around target frame for snappy responsive scrub
  const ensureFramesAround = useCallback(
    (target: number, radius = 12) => {
      const start = Math.max(1, target - radius);
      const end = Math.min(TOTAL_SCROLL_FRAMES, target + radius);
      for (let i = start; i <= end; i++) {
        loadSingleFrame(i);
      }
    },
    [loadSingleFrame]
  );

  // Progressive frame preloader
  useEffect(() => {
    if (typeof window === "undefined") return;

    isReducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Allocate array
    imagesRef.current = new Array(TOTAL_SCROLL_FRAMES + 1).fill(null);

    // 1. Load Frame 1 immediately
    const firstImg = new window.Image();
    firstImg.src = getFrameSrc(1);
    firstImg.onload = () => {
      imagesRef.current[1] = firstImg;
      setFirstFrameLoaded(true);
      handleResize();
      renderFrame(1);
    };

    // 2. Load sparse keyframes across sequence for immediate responsive preview
    for (let i = 10; i <= TOTAL_SCROLL_FRAMES; i += 10) {
      loadSingleFrame(i);
    }

    // 3. Background progressive queue for all remaining frames
    let currentBatchIndex = 2;
    const loadNextBatch = () => {
      if (currentBatchIndex > TOTAL_SCROLL_FRAMES) return;

      const batchSize = 8;
      const end = Math.min(currentBatchIndex + batchSize, TOTAL_SCROLL_FRAMES + 1);

      for (let i = currentBatchIndex; i < end; i++) {
        loadSingleFrame(i);
      }

      currentBatchIndex = end;
      if (currentBatchIndex <= TOTAL_SCROLL_FRAMES) {
        if ("requestIdleCallback" in window) {
          (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(loadNextBatch);
        } else {
          setTimeout(loadNextBatch, 30);
        }
      }
    };

    const timer = setTimeout(loadNextBatch, 120);

    return () => clearTimeout(timer);
  }, [handleResize, renderFrame, loadSingleFrame]);

  // Persistent RAF animation loop with smooth lerp interpolation
  useEffect(() => {
    let active = true;

    const animate = () => {
      if (!active) return;

      const target = targetFrameRef.current;
      if (isReducedMotionRef.current) {
        currentFrameRef.current = target;
      } else {
        const diff = target - currentFrameRef.current;
        if (Math.abs(diff) < 0.005) {
          currentFrameRef.current = target;
        } else {
          currentFrameRef.current += diff * 0.16;
        }
      }

      const frameToRender = Math.min(
        Math.max(Math.round(currentFrameRef.current), 1),
        TOTAL_SCROLL_FRAMES
      );

      if (frameToRender !== lastRenderedFrameRef.current) {
        renderFrame(frameToRender);
        lastRenderedFrameRef.current = frameToRender;
      }

      rafIdRef.current = requestAnimationFrame(animate);
    };

    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      active = false;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [renderFrame]);

  // Lenis smooth scroll and scroll progress handler
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });

    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const totalScrollableDistance = container.offsetHeight - window.innerHeight;
      if (totalScrollableDistance <= 0) return;

      const scrolled = -container.getBoundingClientRect().top;
      const progress = Math.min(Math.max(scrolled / totalScrollableDistance, 0), 1);
      setScrollProgress(progress);

      const targetFrame = Math.round(1 + progress * (TOTAL_SCROLL_FRAMES - 1));
      targetFrameRef.current = targetFrame;
      ensureFramesAround(targetFrame, 12);
    };

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    const rafId = requestAnimationFrame(raf);

    lenis.on("scroll", handleScroll);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    handleScroll();
    handleResize();

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
    };
  }, [ensureFramesAround, handleResize]);

  // Gentle fade and upward drift for hero content during scroll
  const heroContentOpacity = Math.max(0, 1 - scrollProgress * 3.2);
  const heroContentTranslateY = scrollProgress * -45;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[520vh] bg-[#02040a] text-white selection:bg-red-600/40 selection:text-white"
    >
      {/* =========================================================================
          STICKY FULL-SCREEN VIEWPORT: Pinned canvas & hero UI overlay
          ========================================================================= */}
      <div className="sticky top-0 h-screen w-full overflow-hidden flex flex-col justify-between">
        
        {/* =====================================================================
            CINEMATIC CANVAS BACKGROUND LAYER (Scroll-linked 234 frames)
            ===================================================================== */}
        <div className="absolute inset-0 z-0 bg-[#02040a] pointer-events-none">
          {/* Static high-res background fallback until canvas renders frame 1 */}
          <div
            className={`absolute inset-0 transition-opacity duration-500 ${
              firstFrameLoaded ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            <Image
              src="/juet-castle-bg.jpg"
              alt="JUET Techfest Gothic Castle"
              fill
              priority
              quality={95}
              className="object-cover object-[62%_center] sm:object-[58%_center] md:object-center"
            />
          </div>

          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full block"
          />

          {/* Seamless dark luxury gradients ensuring crisp contrast and zero hard edges */}
          <div className="absolute inset-y-0 left-0 w-full md:w-[65%] bg-gradient-to-r from-black/60 via-black/25 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/75 via-black/30 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />
        </div>

        {/* =====================================================================
            HEADER / NAVBAR: Fixed at top of pinned screen
            ===================================================================== */}
        <header className="relative z-30 w-full max-w-[1480px] mx-auto px-6 sm:px-10 lg:px-16 pt-7 pb-4 flex items-center justify-between pointer-events-auto">
          {/* Left: Brand Title */}
          <div className="flex items-center">
            <a
              href="#"
              className="font-display tracking-[0.05em] text-2xl sm:text-3xl uppercase transition-opacity hover:opacity-90"
            >
              <span className="text-white font-bold">JUET </span>
              <span className="text-[#e50914] font-bold">TECHFEST</span>
            </a>
          </div>

          {/* Center: Navigation Links with Red Active Indicator */}
          <nav className="hidden md:flex items-center gap-8 lg:gap-10 text-[13px] tracking-wide font-medium">
            {navLinks.map((link) => {
              const isActive = activeTab === link.name;
              return (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab(link.name);
                  }}
                  className={`relative py-1 transition-colors ${
                    isActive
                      ? "text-white font-medium"
                      : "text-zinc-300 hover:text-white"
                  }`}
                >
                  {link.name}
                  {isActive && (
                    <span className="absolute left-0 right-0 -bottom-1.5 h-[2px] bg-[#e50914]" />
                  )}
                </a>
              );
            })}
          </nav>

          {/* Right: "Register Now ->" Action Button */}
          <div className="hidden md:flex items-center">
            <a
              href="#register"
              className="group inline-flex items-center gap-2 px-5 py-1.5 rounded-sm border border-[#e50914] text-[#e50914] hover:bg-[#e50914] hover:text-white text-xs font-semibold tracking-wide transition-all duration-200"
            >
              <span>Register Now</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>

          {/* Mobile Hamburger Toggle */}
          <div className="flex md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-md bg-black/60 border border-zinc-800 text-zinc-300 hover:text-white focus:outline-none"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden relative z-40 bg-[#090b10]/95 backdrop-blur-xl border-b border-red-900/30 px-6 py-6 space-y-4 pointer-events-auto">
            <nav className="flex flex-col space-y-3.5">
              {navLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  onClick={() => {
                    setActiveTab(link.name);
                    setMobileMenuOpen(false);
                  }}
                  className={`text-base font-medium transition-colors ${
                    activeTab === link.name ? "text-[#e50914]" : "text-zinc-300"
                  }`}
                >
                  {link.name}
                </a>
              ))}
            </nav>
            <div className="pt-3 border-t border-zinc-800">
              <a
                href="#register"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-sm bg-[#e50914] text-white font-semibold text-sm"
              >
                <span>Register Now</span>
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {/* =====================================================================
            HERO MAIN CONTENT: Fades smoothly as user journeys down the bridge
            ===================================================================== */}
        <main
          className="relative z-10 flex-1 flex flex-col justify-center max-w-[1480px] w-full mx-auto px-6 sm:px-10 lg:px-16 pt-10 sm:pt-16 pb-20 sm:pb-28 transition-all duration-75"
          style={{
            opacity: heroContentOpacity,
            transform: `translateY(${heroContentTranslateY}px)`,
            pointerEvents: heroContentOpacity < 0.1 ? "none" : "auto",
          }}
        >
          <div className="w-full max-w-4xl space-y-4 sm:space-y-6">
            
            {/* 1. Giant Stacked Typography: JUET TECHFEST */}
            <div className="select-none">
              <h1 className="font-display uppercase tracking-[-0.01em] leading-[0.84]">
                {/* Line 1: JUET */}
                <div className="text-[5.5rem] sm:text-[8rem] md:text-[9.5rem] lg:text-[11.2rem] xl:text-[12.6rem] font-bold text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)]">
                  JUET
                </div>

                {/* Line 2: TECHFEST (TECH in white, FEST in vibrant red) */}
                <div className="text-[5.5rem] sm:text-[8rem] md:text-[9.5rem] lg:text-[11.2rem] xl:text-[12.6rem] font-bold -mt-2 sm:-mt-4 md:-mt-6 lg:-mt-8">
                  <span className="text-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)]">
                    TECH
                  </span>
                  <span className="text-[#e50914] drop-shadow-[0_0_35px_rgba(229,9,20,0.45)]">
                    FEST
                  </span>
                </div>
              </h1>
            </div>

            {/* 2. Sub-kicker Tagline: IDEAS · PEOPLE · POSSIBILITIES */}
            <div className="pt-1">
              <p className="text-xs sm:text-sm md:text-[15px] font-medium tracking-[0.28em] sm:tracking-[0.34em] uppercase text-zinc-300 flex items-center flex-wrap gap-1 sm:gap-2">
                <span>IDEAS</span>
                <span className="text-[#e50914] font-bold mx-1.5 sm:mx-2 text-base leading-none">·</span>
                <span>PEOPLE</span>
                <span className="text-[#e50914] font-bold mx-1.5 sm:mx-2 text-base leading-none">·</span>
                <span>POSSIBILITIES</span>
              </p>
            </div>

            {/* 3. Action Buttons Row: Explore Events -> and ▷ Watch Trailer */}
            <div className="pt-4 sm:pt-6 flex flex-wrap items-center gap-5 sm:gap-7">
              {/* Primary Button: Explore Events -> */}
              <a
                href="#events"
                className="group inline-flex items-center justify-center gap-2.5 px-6 sm:px-7 py-3 rounded-sm bg-[#e50914] hover:bg-[#c90812] text-white font-semibold text-xs sm:text-sm tracking-wide transition-all duration-200 shadow-[0_4px_20px_rgba(229,9,20,0.35)] hover:shadow-[0_6px_25px_rgba(229,9,20,0.5)]"
              >
                <span>Explore Events</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-100" />
              </a>

              {/* Secondary Button: ▷ Watch Trailer */}
              <a
                href="#trailer"
                className="group inline-flex items-center gap-3 text-white hover:text-zinc-200 transition-colors duration-200"
              >
                <span className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full border border-white/80 group-hover:border-[#e50914] group-hover:bg-[#e50914]/20 transition-all duration-200">
                  <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white fill-white ml-0.5 group-hover:text-[#e50914] group-hover:fill-[#e50914] transition-colors" />
                </span>
                <span className="text-xs sm:text-sm font-medium tracking-wide">
                  Watch Trailer
                </span>
              </a>
            </div>

          </div>
        </main>

        {/* Scroll Progress Indicator Bar at Bottom of Pinned Viewport */}
        <div className="relative z-20 w-full px-6 sm:px-10 lg:px-16 pb-4 flex items-center justify-between text-[11px] tracking-wider uppercase text-zinc-400 font-mono">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#e50914] animate-pulse" />
            <span>Scroll To Enter</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-24 sm:w-36 h-[2px] bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#e50914] to-red-500 transition-all duration-75"
                style={{ width: `${Math.round(scrollProgress * 100)}%` }}
              />
            </div>
            <span>{Math.round(scrollProgress * 100)}%</span>
          </div>
        </div>

      </div>
    </div>
  );
}
