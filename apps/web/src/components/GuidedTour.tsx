import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import "../styles/tour.css";

const STORAGE_KEY = "pulso.tour.v1";

type TourPhase = "closed" | "gate" | "steps" | "final";
type CardSide = "left" | "right" | "below" | "above";

interface TourStep {
  target: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    target: "watchlist",
    title: "MARKET WATCH",
    body: "Your instruments — crypto and FX. Each row shows the last price, its change, a live sparkline and risk flags. Click a row to make it the active instrument that drives every other panel.",
  },
  {
    target: "chart",
    title: "COMPOSITE CHART",
    body: "The active instrument, charted. Switch between price, return and z-score, and overlay a second instrument to compare (rebased to a common start). The dotted markers flag the maximum drawdown and the window low.",
  },
  {
    target: "status",
    title: "LIVE FEED",
    body: "The feed at a glance: LIVE vs CACHED, the data provider, how fresh the last tick is, and the session clock. A green dot means real, live market data.",
  },
  {
    target: "lowerdock",
    title: "CORRELATION & VIEWS",
    body: "How the instruments move together. In the matrix, green means they move in sync, red means they move opposite. Click any cell to compare that pair. The tabs switch to drawdown, relative performance and events.",
  },
  {
    target: "risk",
    title: "RISK STACK",
    body: "Risk metrics for the active instrument: realized volatility, Sharpe and Sortino, Value at Risk and Expected Shortfall, max drawdown, beta and momentum. The gauge on top is a composite risk score.",
  },
  {
    target: "commands",
    title: "KEYBOARD",
    body: "Everything is keyboard-driven. Arrow keys change the instrument, 1–5 set the time window, letters switch the lower views, and Esc clears selections.",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measure(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const box = el.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return { top: box.top, left: box.left, width: box.width, height: box.height };
}

function pickSide(hole: Rect): CardSide {
  const viewportWidth = window.innerWidth;
  const centerX = hole.left + hole.width / 2;
  if (centerX < viewportWidth / 3) return "right";
  if (centerX > (viewportWidth * 2) / 3) return "left";
  const viewportHeight = window.innerHeight;
  if (hole.top + hole.height + 200 < viewportHeight) return "below";
  return "above";
}

const CARD_WIDTH = 320;
const CARD_GAP = 16;
const CARD_MARGIN = 12;

function cardPosition(hole: Rect, side: CardSide): { top: number; left: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const estimatedHeight = 200;

  if (side === "right") {
    return {
      top: Math.min(Math.max(CARD_MARGIN, hole.top), viewportHeight - estimatedHeight - CARD_MARGIN),
      left: Math.min(hole.left + hole.width + CARD_GAP, viewportWidth - CARD_WIDTH - CARD_MARGIN),
    };
  }
  if (side === "left") {
    return {
      top: Math.min(Math.max(CARD_MARGIN, hole.top), viewportHeight - estimatedHeight - CARD_MARGIN),
      left: Math.max(CARD_MARGIN, hole.left - CARD_GAP - CARD_WIDTH),
    };
  }
  if (side === "below") {
    return {
      top: Math.min(hole.top + hole.height + CARD_GAP, viewportHeight - estimatedHeight - CARD_MARGIN),
      left: Math.min(Math.max(CARD_MARGIN, hole.left), viewportWidth - CARD_WIDTH - CARD_MARGIN),
    };
  }
  return {
    top: Math.max(CARD_MARGIN, hole.top - CARD_GAP - estimatedHeight),
    left: Math.min(Math.max(CARD_MARGIN, hole.left), viewportWidth - CARD_WIDTH - CARD_MARGIN),
  };
}

const HOLE_PADDING = 6;

export function GuidedTour() {
  const [phase, setPhase] = useState<TourPhase>("closed");
  const [stepIndex, setStepIndex] = useState(0);
  const [hole, setHole] = useState<Rect | null>(null);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) setPhase("gate");
    } catch {
      // localStorage unavailable (e.g. private mode) — skip auto-open
    }
  }, []);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore persistence failures
    }
  }, []);

  const closeTour = useCallback(() => {
    markSeen();
    setPhase("closed");
  }, [markSeen]);

  const startTour = useCallback(() => {
    setStepIndex(0);
    setPhase("steps");
  }, []);

  const skipTour = useCallback(() => {
    closeTour();
  }, [closeTour]);

  const advance = useCallback(() => {
    setStepIndex((current) => {
      if (current + 1 >= STEPS.length) {
        setPhase("final");
        return current;
      }
      return current + 1;
    });
  }, []);

  const reopen = useCallback(() => {
    setPhase("gate");
  }, []);

  const currentStep = STEPS[stepIndex];

  useLayoutEffect(() => {
    if (phase !== "steps" || !currentStep) {
      setHole(null);
      return;
    }
    const recompute = () => setHole(measure(currentStep.target));
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [phase, currentStep, stepIndex]);

  useEffect(() => {
    if (phase === "steps" && currentStep && !hole) {
      // target missing — skip gracefully to next step
      advance();
    }
  }, [phase, currentStep, hole, advance]);

  useEffect(() => {
    if (phase === "closed") return;
    primaryButtonRef.current?.focus();
  }, [phase, stepIndex]);

  useEffect(() => {
    if (phase === "closed") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        closeTour();
        return;
      }
      if (event.key === "Enter" || event.key === "ArrowRight") {
        if (phase === "gate") startTour();
        else if (phase === "steps") advance();
        else if (phase === "final") closeTour();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [phase, closeTour, startTour, advance]);

  if (phase === "closed") {
    return (
      <button type="button" className="tour-replay" onClick={reopen} aria-label="Replay guided tour">
        TOUR
      </button>
    );
  }

  if (phase === "gate") {
    return (
      <div className="tour-backdrop">
        <div className="tour-modal" role="dialog" aria-modal="true" aria-labelledby="tour-gate-title">
          <p className="tour-wordmark" id="tour-gate-title">PULSO</p>
          <p className="tour-tagline">A quant analytics workstation, on live market data.</p>
          <div className="tour-actions">
            <button type="button" className="tour-btn tour-btn-primary" onClick={startTour} ref={primaryButtonRef}>
              TAKE THE TOUR
            </button>
            <button type="button" className="tour-btn" onClick={skipTour}>
              SKIP TO DASHBOARD
            </button>
          </div>
          <p className="tour-caption">~30 seconds · 6 steps</p>
        </div>
      </div>
    );
  }

  if (phase === "steps" && currentStep && hole) {
    const paddedHole: Rect = {
      top: hole.top - HOLE_PADDING,
      left: hole.left - HOLE_PADDING,
      width: hole.width + HOLE_PADDING * 2,
      height: hole.height + HOLE_PADDING * 2,
    };
    const side = pickSide(paddedHole);
    const position = cardPosition(paddedHole, side);
    const isLast = stepIndex === STEPS.length - 1;

    return (
      <div className="tour-spotlight-layer">
        <div className="tour-catcher" />
        <div
          className="tour-hole"
          style={{ top: paddedHole.top, left: paddedHole.left, width: paddedHole.width, height: paddedHole.height }}
        />
        <div
          className="tour-card"
          data-side={side}
          style={{ top: position.top, left: position.left }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-step-title"
        >
          <p className="tour-step-counter">{String(stepIndex + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}</p>
          <h2 className="tour-step-title" id="tour-step-title" aria-live="polite">{currentStep.title}</h2>
          <p className="tour-step-body">{currentStep.body}</p>
          <div className="tour-step-footer">
            <button type="button" className="tour-btn-text" onClick={skipTour}>Skip tour</button>
            <button type="button" className="tour-btn tour-btn-primary" onClick={advance} ref={primaryButtonRef}>
              {isLast ? "Finish →" : "Continue →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "final") {
    return (
      <div className="tour-backdrop">
        <div className="tour-modal" role="dialog" aria-modal="true" aria-labelledby="tour-final-title">
          <h2 className="tour-final-title" id="tour-final-title" aria-live="polite">YOU'RE SET</h2>
          <p className="tour-final-body">
            You can now read the panel and compare instruments with context. One thing: Pulso is a product demo
            built on real market data — it is not financial advice. Always do your own research.
          </p>
          <span className="tour-dyor-chip">DYOR · NOT FINANCIAL ADVICE</span>
          <div className="tour-actions">
            <button type="button" className="tour-btn tour-btn-primary" onClick={closeTour} ref={primaryButtonRef}>
              ENTER THE DASHBOARD
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
