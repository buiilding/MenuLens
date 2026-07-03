import { useCallback, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Camera,
  Utensils,
  UploadCloud,
  RotateCcw,
  ExternalLink,
  ImageOff,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MAX_MB = 10;
const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// ---------- Header ----------
const AppHeader = ({ onReset, hasResults }) => (
  <header className="w-full border-b border-[#EAE5DF] bg-[#FDFBF7]/80 backdrop-blur-sm sticky top-0 z-20">
    <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#C84B31] grid place-items-center text-white shadow-sm">
          <Utensils className="w-5 h-5" strokeWidth={1.8} />
        </div>
        <div>
          <div className="font-display text-lg leading-none text-[#2D2825]">
            Menu<span className="text-[#C84B31]">Lens</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-[#766C65] mt-1">
            Snap · Extract · See
          </div>
        </div>
      </div>
      {hasResults && (
        <button
          data-testid="header-reset-button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-full border border-[#EAE5DF] px-4 py-2 text-sm text-[#2D2825] hover:bg-stone-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Scan another
        </button>
      )}
    </div>
  </header>
);

// ---------- Upload Zone ----------
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
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-16 pb-16">
      <div className="text-center mb-8 sm:mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#EAE5DF] bg-white px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#766C65] mb-6">
          <Sparkles className="w-3 h-3 text-[#C84B31]" />
          Menu → Visual dish cards
        </div>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-[#2D2825] tracking-tight leading-[1.05]">
          See the menu <em className="text-[#C84B31] not-italic">before</em> you order.
        </h1>
        <p className="mt-5 max-w-xl mx-auto text-base sm:text-lg text-[#766C65] leading-relaxed">
          Snap a photo of any restaurant menu. We&apos;ll turn every dish into a
          beautiful card with a real image, so you know exactly what&apos;s coming.
        </p>
      </div>

      <div
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
        className={`dropzone relative rounded-2xl border-2 border-dashed border-[#EAE5DF] bg-white/60 px-6 py-12 sm:py-16 grain-overlay ${
          dragging ? "is-dragging" : ""
        }`}
      >
        <div className="relative flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-[#FDF1EC] grid place-items-center mb-5">
            <UploadCloud className="w-7 h-7 text-[#C84B31]" strokeWidth={1.6} />
          </div>
          <div className="font-display text-2xl sm:text-3xl text-[#2D2825]">
            Drop a menu photo here
          </div>
          <p className="mt-2 text-sm text-[#766C65]">
            JPEG, PNG or WEBP · up to {MAX_MB} MB
          </p>

          <div className="mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <button
              data-testid="upload-choose-file-button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#C84B31] hover:bg-[#A83C25] text-white px-6 py-3 text-sm font-medium transition-colors shadow-sm"
            >
              <UploadCloud className="w-4 h-4" />
              Choose a file
            </button>
            <button
              data-testid="upload-camera-button"
              onClick={() => cameraInputRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#EAE5DF] bg-white text-[#2D2825] px-6 py-3 text-sm font-medium hover:bg-stone-50 transition-colors"
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
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        {[
          { n: "1", t: "Upload", d: "Any menu photo works." },
          { n: "2", t: "Extract", d: "AI reads every dish." },
          { n: "3", t: "See", d: "Real images per meal." },
        ].map((step) => (
          <div
            key={step.n}
            className="rounded-xl border border-[#EAE5DF] bg-white p-4 flex items-start gap-3"
          >
            <div className="w-7 h-7 rounded-full bg-[#FDF1EC] text-[#C84B31] grid place-items-center font-display text-sm">
              {step.n}
            </div>
            <div>
              <div className="font-medium text-[#2D2825]">{step.t}</div>
              <div className="text-[#766C65]">{step.d}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

// ---------- Loading state ----------
const LoadingState = ({ phase, previewUrl }) => {
  const messages = {
    analyzing: "Reading your menu…",
    searching: "Plating up dish photos…",
  };
  const sub = {
    analyzing: "Our AI is identifying every dish, price, and category.",
    searching: "Searching the web for the best image of each meal.",
  };
  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10"
      data-testid="loading-state"
    >
      <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-start">
        {previewUrl && (
          <div className="w-full md:w-64 flex-shrink-0">
            <div className="rounded-xl overflow-hidden border border-[#EAE5DF] bg-white shadow-sm">
              <img
                src={previewUrl}
                alt="Menu preview"
                className="w-full h-auto max-h-[60vh] object-contain"
              />
            </div>
          </div>
        )}
        <div className="flex-1 w-full">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#EAE5DF] bg-white px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-[#C84B31]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C84B31] animate-pulse" />
            {phase === "analyzing" ? "Step 1 of 2" : "Step 2 of 2"}
          </div>
          <h2 className="font-display text-3xl sm:text-4xl text-[#2D2825] mt-4">
            {messages[phase]}
          </h2>
          <p className="mt-2 text-[#766C65]">{sub[phase]}</p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-[#EAE5DF] bg-white overflow-hidden"
              >
                <div className="warm-pulse aspect-[4/3]" />
                <div className="p-4 space-y-3">
                  <div className="warm-pulse h-3 w-20 rounded" />
                  <div className="warm-pulse h-5 w-3/4 rounded" />
                  <div className="warm-pulse h-3 w-full rounded" />
                  <div className="warm-pulse h-3 w-5/6 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// ---------- Dish Card ----------
const ConfidencePill = ({ value }) => {
  const pct = Math.round((value || 0) * 100);
  const tone =
    pct >= 80
      ? "bg-[#EAF3EC] text-[#4A7C59]"
      : pct >= 55
      ? "bg-[#FDF1EC] text-[#C84B31]"
      : "bg-stone-100 text-[#766C65]";
  return (
    <span
      data-testid="dish-confidence"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {pct}% match
    </span>
  );
};

const DishCard = ({ item, index }) => {
  const [imgError, setImgError] = useState(false);
  const showImg = item.image_url && !imgError;
  return (
    <article
      data-testid={`dish-card-${index}`}
      className="dish-card group rounded-xl border border-[#EAE5DF] bg-white overflow-hidden shadow-sm flex flex-col"
    >
      <div className="relative aspect-[4/3] bg-[#F7F2EA] overflow-hidden">
        {showImg ? (
          <img
            data-testid={`dish-image-${index}`}
            src={item.image_url}
            alt={item.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div
            data-testid={`dish-image-placeholder-${index}`}
            className="w-full h-full grid place-items-center text-[#B8AFA6]"
          >
            <div className="flex flex-col items-center gap-2 text-center px-3">
              <ImageOff className="w-8 h-8" strokeWidth={1.5} />
              <span className="text-xs uppercase tracking-[0.18em]">
                No image found
              </span>
            </div>
          </div>
        )}
        {item.price && (
          <span
            data-testid={`dish-price-${index}`}
            className="absolute top-3 right-3 rounded-full bg-white/95 backdrop-blur-sm px-2.5 py-1 text-sm font-medium text-[#2D2825] shadow-sm border border-[#EAE5DF]"
          >
            {item.price}
          </span>
        )}
      </div>

      <div className="p-4 sm:p-5 flex-1 flex flex-col">
        {item.category && (
          <div
            data-testid={`dish-category-${index}`}
            className="text-[10px] uppercase tracking-[0.22em] text-[#C84B31] mb-2"
          >
            {item.category}
          </div>
        )}
        <h3
          data-testid={`dish-name-${index}`}
          className="font-display text-xl sm:text-2xl text-[#2D2825] leading-tight"
        >
          {item.name}
        </h3>
        {item.description && (
          <p
            data-testid={`dish-description-${index}`}
            className="mt-2 text-sm text-[#766C65] leading-relaxed"
          >
            {item.description}
          </p>
        )}

        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
          <ConfidencePill value={item.confidence} />
          {item.image_source_url && (
            <a
              data-testid={`dish-source-link-${index}`}
              href={item.image_source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#766C65] hover:text-[#C84B31] transition-colors"
              title={item.image_source_name || "Image source"}
            >
              Source
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </article>
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
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10"
      data-testid="results-view"
    >
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          {data.detected_cuisine && (
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#C84B31]">
              {data.detected_cuisine} · {data.items.length} dishes
            </div>
          )}
          <h2
            data-testid="results-title"
            className="font-display text-3xl sm:text-4xl text-[#2D2825] tracking-tight mt-2"
          >
            {data.restaurant_name || "Your visual menu"}
          </h2>
          <p className="mt-2 text-[#766C65] text-sm">
            Tap a card&apos;s Source link to see where an image came from.
          </p>
        </div>
        <button
          data-testid="results-reset-button"
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-full bg-[#C84B31] hover:bg-[#A83C25] text-white px-5 py-2.5 text-sm font-medium transition-colors shadow-sm self-start"
        >
          <RotateCcw className="w-4 h-4" />
          Scan another menu
        </button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="mb-10">
          <div className="flex items-center gap-3 mb-5">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[#766C65]">
              {cat}
            </div>
            <div className="flex-1 h-px bg-[#EAE5DF]" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
            {items.map((it, i) => (
              <DishCard key={`${cat}-${i}-${it.name}`} item={it} index={data.items.indexOf(it)} />
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
    className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center"
    data-testid="error-state"
  >
    <div className="w-14 h-14 mx-auto rounded-full bg-[#FDECEC] grid place-items-center text-[#B91C1C]">
      <AlertTriangle className="w-7 h-7" strokeWidth={1.6} />
    </div>
    <h2 className="mt-5 font-display text-3xl text-[#2D2825]">
      Something went sideways
    </h2>
    <p data-testid="error-message" className="mt-3 text-[#766C65]">
      {message}
    </p>
    <button
      data-testid="error-reset-button"
      onClick={onReset}
      className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#C84B31] hover:bg-[#A83C25] text-white px-5 py-2.5 text-sm font-medium transition-colors"
    >
      <RotateCcw className="w-4 h-4" />
      Try again
    </button>
  </section>
);

// ---------- Root App ----------
export default function App() {
  const [status, setStatus] = useState("idle"); // idle | analyzing | searching | results | error
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError("");
    setData(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

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

  return (
    <div className="App min-h-screen bg-[#FDFBF7] text-[#2D2825]">
      <Toaster
        position="top-center"
        richColors
        toastOptions={{ style: { fontFamily: "Manrope, sans-serif" } }}
      />
      <AppHeader onReset={reset} hasResults={status === "results" || status === "error"} />

      {status === "idle" && <UploadZone onFile={handleFile} />}
      {(status === "analyzing" || status === "searching") && (
        <LoadingState phase={status} previewUrl={previewUrl} />
      )}
      {status === "results" && data && <Results data={data} onReset={reset} />}
      {status === "error" && <ErrorState message={error} onReset={reset} />}

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 border-t border-[#EAE5DF] mt-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#766C65]">
          <div>
            MenuLens · Powered by GPT-5.2 & Brave Search
          </div>
          <div>Images are found via web search — accuracy may vary.</div>
        </div>
      </footer>
    </div>
  );
}
