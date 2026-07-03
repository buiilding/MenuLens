import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Aperture,
  Camera,
  UploadCloud,
  RotateCcw,
  ExternalLink,
  ImageOff,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { Toaster, toast } from "sonner";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MAX_MB = 10;
const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const EASE = [0.22, 1, 0.36, 1];

// Client-side demo mode (?demo) — lets us preview the full flow without API keys.
const IS_DEMO = new URLSearchParams(window.location.search).has("demo");
const u = (id) => `https://images.unsplash.com/${id}?w=900&q=80&auto=format&fit=crop`;
const DEMO_MENU_IMG = u("photo-1414235077428-338989a2e8c0");
const DEMO_DATA = {
  restaurant_name: "Baan Siam",
  detected_cuisine: "Thai",
  items: [
    { name: "Crispy Spring Rolls", description: "Hand-rolled vegetables, glass noodles, sweet chili dip.", category: "Starters", price: "$8", confidence: 0.93, image_url: u("photo-1544025162-d76694265947"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
    { name: "Tom Kha Soup", description: "Coconut broth, galangal, lemongrass, oyster mushrooms.", category: "Starters", price: "$9", confidence: 0.88, image_url: u("photo-1547592166-23ac45744acd"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
    { name: "Papaya Salad", description: "Green papaya, bird's eye chili, lime, roasted peanuts.", category: "Starters", price: "$10", confidence: 0.74, image_url: u("photo-1546069901-ba9599a7e63c"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
    { name: "Pad Thai Goong", description: "Rice noodles, tiger prawns, tamarind, egg, chives.", category: "Mains", price: "$16", confidence: 0.95, image_url: u("photo-1559314809-0f31657def5e"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
    { name: "Green Curry Chicken", description: "Sweet basil, thai eggplant, coconut cream, jasmine rice.", category: "Mains", price: "$15", confidence: 0.91, image_url: u("photo-1455619452474-d2be8b1e70cd"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
    { name: "Khao Soi", description: "Northern curried noodles, crispy nest, pickled mustard greens.", category: "Mains", price: "$17", confidence: 0.82, image_url: u("photo-1569718212165-3a8278d5f624"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
    { name: "Basil Fried Rice", description: "Holy basil, chili jam, farm egg, cucumber.", category: "Mains", price: "$14", confidence: 0.68, image_url: u("photo-1512058564366-18510be2db19"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
    { name: "Mango Sticky Rice", description: "Ripe mango, sweet coconut rice, toasted sesame.", category: "Desserts", price: "$9", confidence: 0.9, image_url: u("photo-1567620905732-2d1ec7ab7445"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
    { name: "Coconut Ice Cream", description: "House-churned, roasted peanuts, palm sugar caramel.", category: "Desserts", price: "$7", confidence: 0.86, image_url: u("photo-1563805042-7684c019e1cb"), image_source_url: "https://unsplash.com", image_source_name: "Unsplash" },
  ],
};

// ---------- Header ----------
const AppHeader = ({ onReset, hasResults }) => (
  <header className="w-full border-b border-[color:var(--line)] bg-[color:var(--paper)]/85 backdrop-blur-md sticky top-0 z-30">
    <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex items-center gap-3">
        <Aperture className="w-6 h-6 text-[color:var(--accent)]" strokeWidth={1.5} />
        <div>
          <div className="font-display text-xl leading-none text-[color:var(--ink)]">
            Menu<em className="text-[color:var(--accent)] not-italic">Lens</em>
          </div>
          <div className="font-meta text-[9px] uppercase tracking-[0.28em] text-[color:var(--ink-soft)] mt-1">
            Snap · Extract · See
          </div>
        </div>
      </div>
      {hasResults && (
        <button
          data-testid="header-reset-button"
          onClick={onReset}
          className="group inline-flex items-center gap-2 font-meta text-[11px] uppercase tracking-[0.18em] text-[color:var(--ink)] hover:text-[color:var(--accent)] transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 transition-transform duration-500 group-hover:-rotate-180" />
          Scan another
        </button>
      )}
    </div>
  </header>
);

// ---------- Upload / hero ----------
const UploadZone = ({ onFile }) => {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleFiles = (files) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Unsupported format", {
        description: "Please upload a JPEG, PNG, or WEBP image.",
      });
      return;
    }
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > MAX_MB) {
      toast.error("Image too large", {
        description: `Max ${MAX_MB} MB. Yours is ${sizeMb.toFixed(1)} MB.`,
      });
      return;
    }
    onFile(file);
  };

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-20 pb-16">
      <div className="text-center mb-10 sm:mb-14">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="font-meta text-[11px] uppercase tracking-[0.3em] text-[color:var(--ink-soft)] mb-6"
        >
          Any menu&nbsp;&nbsp;→&nbsp;&nbsp;a visual one
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
          className="font-display text-5xl sm:text-6xl lg:text-7xl text-[color:var(--ink)] tracking-tight leading-[0.98]"
        >
          See it <em className="text-[color:var(--accent)]">before</em>
          <br />
          you order it.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.18, ease: EASE }}
          className="mt-6 max-w-xl mx-auto text-base sm:text-lg text-[color:var(--ink-soft)] leading-relaxed"
        >
          Photograph a restaurant menu and watch every dish turn into a card
          with a real photo — so nothing that lands on your table is a surprise.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.99 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.28, ease: EASE }}
        data-testid="upload-area"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`placemat px-6 py-14 sm:py-20 ${dragging ? "is-dragging" : ""}`}
      >
        <div className="relative flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-[color:var(--accent-blush)] grid place-items-center mb-6">
            <UploadCloud className="w-7 h-7 text-[color:var(--accent)]" strokeWidth={1.5} />
          </div>
          <div className="font-display text-2xl sm:text-3xl text-[color:var(--ink)]">
            Drop a menu photo here
          </div>
          <p className="mt-2 font-meta text-[11px] uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">
            JPEG · PNG · WEBP — up to {MAX_MB} MB
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button
              data-testid="upload-choose-file-button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] active:scale-[0.98] text-white px-7 py-3.5 text-sm font-medium transition-all shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              Choose a file
            </button>
            <button
              data-testid="upload-camera-button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--card-bg)] text-[color:var(--ink)] px-7 py-3.5 text-sm font-medium hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] active:scale-[0.98] transition-all"
            >
              <Camera className="w-4 h-4" />
              Use camera
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="visually-hidden"
            data-testid="upload-file-input"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="visually-hidden"
            data-testid="upload-camera-input"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        className="mt-10 border-t border-b border-[color:var(--line)] divide-y sm:divide-y-0 sm:divide-x divide-[color:var(--line)] grid grid-cols-1 sm:grid-cols-3"
      >
        {[
          { n: "01", t: "Upload", d: "Any menu photo works — even dim candlelight shots." },
          { n: "02", t: "Extract", d: "AI reads every dish, price, and category." },
          { n: "03", t: "Feast your eyes", d: "A real photo for every single dish." },
        ].map((step) => (
          <div key={step.n} className="py-5 px-4 sm:px-6 flex items-start gap-4">
            <div className="font-meta text-[11px] text-[color:var(--accent)] pt-1">{step.n}</div>
            <div>
              <div className="font-display text-lg text-[color:var(--ink)]">{step.t}</div>
              <div className="text-sm text-[color:var(--ink-soft)] mt-0.5">{step.d}</div>
            </div>
          </div>
        ))}
      </motion.div>
    </section>
  );
};

// ---------- Loading / scan theater ----------
const SCAN_LINES = [
  "Reading the menu…",
  "Deciphering the chef's handwriting…",
  "Found the dishes — hunting down photos…",
  "Plating everything up…",
];

const LoadingState = ({ phase, previewUrl }) => {
  const [lineIdx, setLineIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setLineIdx((i) => (i + 1) % SCAN_LINES.length),
      2600
    );
    return () => clearInterval(id);
  }, []);

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10"
      data-testid="loading-state"
    >
      <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-start">
        {previewUrl && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="w-full md:w-72 flex-shrink-0"
          >
            <div className="scan-frame rounded-2xl overflow-hidden border border-[color:var(--line)] bg-[color:var(--card-bg)] shadow-sm">
              <img
                src={previewUrl}
                alt="Menu preview"
                className="w-full h-auto max-h-[60vh] object-contain"
              />
            </div>
            <div className="mt-3 font-meta text-[10px] uppercase tracking-[0.24em] text-[color:var(--ink-soft)] text-center">
              Your menu
            </div>
          </motion.div>
        )}
        <div className="flex-1 w-full">
          <div className="inline-flex items-center gap-2 font-meta text-[11px] uppercase tracking-[0.24em] text-[color:var(--accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)] animate-pulse" />
            {phase === "analyzing" ? "Course 1 of 2 — reading" : "Course 2 of 2 — plating"}
          </div>
          <div className="mt-4 h-[5.5rem] sm:h-[6rem] overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.h2
                key={lineIdx}
                initial={{ opacity: 0, y: 26 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -22 }}
                transition={{ duration: 0.5, ease: EASE }}
                className="font-display text-3xl sm:text-4xl text-[color:var(--ink)] leading-tight"
              >
                {SCAN_LINES[lineIdx]}
              </motion.h2>
            </AnimatePresence>
          </div>
          <p className="text-[color:var(--ink-soft)] -mt-4">
            Good things take a moment. Your visual menu is being set.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.15 + i * 0.09, ease: EASE }}
                className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--card-bg)] overflow-hidden"
              >
                <div className="warm-pulse aspect-[4/3]" />
                <div className="p-5 space-y-3">
                  <div className="warm-pulse h-3 w-20 rounded-full" />
                  <div className="warm-pulse h-5 w-3/4 rounded-full" />
                  <div className="warm-pulse h-3 w-full rounded-full" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// ---------- Dish card ----------
const ConfidenceMark = ({ value }) => {
  const pct = Math.round((value || 0) * 100);
  const dot =
    pct >= 80 ? "bg-[color:var(--success)]" : pct >= 55 ? "bg-[color:var(--gold)]" : "bg-[color:var(--ink-soft)]";
  return (
    <span
      data-testid="dish-confidence"
      className="inline-flex items-center gap-1.5 font-meta text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)]"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {pct}% match
    </span>
  );
};

const DishImage = ({ item, index, onErrorFallback }) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && <div className="warm-pulse absolute inset-0" />}
      <img
        data-testid={`dish-image-${index}`}
        src={item.image_url}
        alt={item.name}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={onErrorFallback}
        className={`w-full h-full object-cover transition-all duration-700 ease-out group-hover:scale-[1.05] ${
          loaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-md scale-[1.06]"
        }`}
      />
    </>
  );
};

const DishCard = ({ item, index, order }) => {
  const [imgError, setImgError] = useState(false);
  const showImg = item.image_url && !imgError;
  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.65, delay: (order % 3) * 0.09, ease: EASE }}
      data-testid={`dish-card-${index}`}
      className="dish-card group rounded-2xl border border-[color:var(--line)] bg-[color:var(--card-bg)] overflow-hidden flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-[color:var(--paper-deep)] overflow-hidden">
        {showImg ? (
          <DishImage item={item} index={index} onErrorFallback={() => setImgError(true)} />
        ) : (
          <div
            data-testid={`dish-image-placeholder-${index}`}
            className="w-full h-full grid place-items-center text-[#b3a78f]"
          >
            <div className="flex flex-col items-center gap-2 text-center px-3">
              <ImageOff className="w-8 h-8" strokeWidth={1.5} />
              <span className="font-meta text-[10px] uppercase tracking-[0.2em]">
                No photo found
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col">
        {item.category && (
          <div
            data-testid={`dish-category-${index}`}
            className="font-meta text-[9px] uppercase tracking-[0.24em] text-[color:var(--accent)] mb-2"
          >
            {item.category}
          </div>
        )}

        <div className="flex items-baseline">
          <h3
            data-testid={`dish-name-${index}`}
            className="dish-name font-display text-xl sm:text-[1.4rem] text-[color:var(--ink)] leading-snug"
          >
            {item.name}
          </h3>
          {item.price && (
            <>
              <span className="leader" aria-hidden="true" />
              <span
                data-testid={`dish-price-${index}`}
                className="font-meta text-sm text-[color:var(--ink)] whitespace-nowrap"
              >
                {item.price}
              </span>
            </>
          )}
        </div>

        {item.description && (
          <p
            data-testid={`dish-description-${index}`}
            className="mt-2 text-sm text-[color:var(--ink-soft)] leading-relaxed"
          >
            {item.description}
          </p>
        )}

        <div className="mt-auto pt-4 flex items-center justify-between gap-3 border-t border-[color:var(--line)]/70">
          <ConfidenceMark value={item.confidence} />
          {item.image_source_url && (
            <a
              data-testid={`dish-source-link-${index}`}
              href={item.image_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-meta text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-soft)] hover:text-[color:var(--accent)] transition-colors"
              title={item.image_source_name || "Image source"}
            >
              Source
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </motion.article>
  );
};

// ---------- Results ----------
const Results = ({ data, onReset }) => {
  const grouped = useMemo(() => {
    const g = {};
    data.items.forEach((it) => {
      const k = it.category || "Menu";
      if (!g[k]) g[k] = [];
      g[k].push(it);
    });
    return g;
  }, [data.items]);

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14"
      data-testid="results-view"
    >
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="font-meta text-[11px] uppercase tracking-[0.28em] text-[color:var(--accent)]"
          >
            {data.detected_cuisine ? `${data.detected_cuisine} · ` : ""}
            {data.items.length} dishes found
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: EASE }}
            data-testid="results-title"
            className="font-display text-4xl sm:text-5xl lg:text-6xl text-[color:var(--ink)] tracking-tight mt-3 leading-[1.02]"
          >
            {data.restaurant_name || "Your visual menu"}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-3 text-[color:var(--ink-soft)] text-sm"
          >
            Photos are representative — tap Source on any card to see where it came from.
          </motion.p>
        </div>
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          data-testid="results-reset-button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-full bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] active:scale-[0.98] text-white px-6 py-3 text-sm font-medium transition-all shadow-sm self-start"
        >
          <RotateCcw className="w-4 h-4" />
          Scan another menu
        </motion.button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-12">
          <div className="sticky top-[64px] z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-3 bg-[color:var(--paper)]/92 backdrop-blur-sm">
            <div className="flex items-baseline gap-4">
              <div className="font-display text-lg text-[color:var(--ink)] italic">{cat}</div>
              <div className="flex-1 h-px bg-[color:var(--line)] self-center" />
              <div className="font-meta text-[10px] uppercase tracking-[0.2em] text-[color:var(--ink-soft)]">
                {items.length} {items.length === 1 ? "dish" : "dishes"}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mt-5">
            {items.map((it, i) => (
              <DishCard
                key={`${cat}-${i}-${it.name}`}
                item={it}
                index={data.items.indexOf(it)}
                order={i}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
};

// ---------- Error state ----------
const ErrorState = ({ message, onReset }) => (
  <section
    className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center"
    data-testid="error-state"
  >
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="w-14 h-14 mx-auto rounded-full bg-[#fdecec] grid place-items-center text-[color:var(--error)]"
    >
      <AlertTriangle className="w-7 h-7" strokeWidth={1.6} />
    </motion.div>
    <motion.h2
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.08, ease: EASE }}
      className="mt-6 font-display text-3xl sm:text-4xl text-[color:var(--ink)]"
    >
      That one didn&apos;t plate.
    </motion.h2>
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.18 }}
      data-testid="error-message"
      className="mt-3 text-[color:var(--ink-soft)]"
    >
      {message}
    </motion.p>
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
      data-testid="error-reset-button"
      onClick={onReset}
      className="mt-7 inline-flex items-center gap-2 rounded-full bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] active:scale-[0.98] text-white px-6 py-3 text-sm font-medium transition-all"
    >
      <RotateCcw className="w-4 h-4" />
      Try again
    </motion.button>
  </section>
);

// ---------- Root app ----------
export default function App() {
  const [status, setStatus] = useState("idle"); // idle | analyzing | searching | results | error
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError("");
    setData(null);
    if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  // Demo flow: ?demo walks through the full sequence with sample data.
  useEffect(() => {
    if (!IS_DEMO) return;
    setPreviewUrl(DEMO_MENU_IMG);
    setStatus("analyzing");
    const t1 = setTimeout(() => setStatus("searching"), 2600);
    const t2 = setTimeout(() => {
      setData(DEMO_DATA);
      setStatus("results");
    }, 5200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const handleFile = useCallback(async (file) => {
    setError("");
    setData(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStatus("analyzing");

    // After 3.5s, flip UI copy to "searching"; the request runs the whole time
    const phaseTimer = setTimeout(() => setStatus("searching"), 3500);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await axios.post(`${API}/analyze-menu`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      });
      clearTimeout(phaseTimer);
      setData(res.data);
      setStatus("results");
    } catch (e) {
      clearTimeout(phaseTimer);
      const detail =
        e?.response?.data?.detail ||
        (e?.code === "ECONNABORTED"
          ? "Request timed out. Try a smaller / clearer photo."
          : "We couldn't analyze that menu. Please try another photo.");
      setError(detail);
      setStatus("error");
      toast.error("Analysis failed", { description: detail });
    }
  }, []);

  const view =
    status === "analyzing" || status === "searching" ? "loading" : status;

  return (
    <MotionConfig reducedMotion="user">
      <div className="App min-h-screen bg-[color:var(--paper)] text-[color:var(--ink)]">
        <Toaster
          position="top-center"
          richColors
          toastOptions={{ style: { fontFamily: "Manrope, sans-serif" } }}
        />
        <AppHeader
          onReset={reset}
          hasResults={status === "results" || status === "error"}
        />

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: EASE }}
          >
            {status === "idle" && <UploadZone onFile={handleFile} />}
            {(status === "analyzing" || status === "searching") && (
              <LoadingState phase={status} previewUrl={previewUrl} />
            )}
            {status === "results" && data && (
              <Results data={data} onReset={reset} />
            )}
            {status === "error" && <ErrorState message={error} onReset={reset} />}
          </motion.div>
        </AnimatePresence>

        <footer className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-[color:var(--line)] mt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 font-meta text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink-soft)]">
            <div>MenuLens · Powered by GPT-5.2 &amp; Brave Search</div>
            <div>Images via web search — accuracy may vary</div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
