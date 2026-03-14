import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";

const API_BASE = "http://localhost:5000/api";
const h = React.createElement;

function formatCount(value, singular, plural) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function App() {
  const [symptoms, setSymptoms] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("Loading available symptoms...");
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        const [metadataRes, historyRes] = await Promise.all([
          fetch(`${API_BASE}/metadata`),
          fetch(`${API_BASE}/history`),
        ]);

        const metadata = await metadataRes.json();
        const historyPayload = await historyRes.json();

        if (!metadataRes.ok) {
          throw new Error(metadata.error || "Unable to load metadata");
        }

        setSymptoms(metadata.symptoms);
        setHistory(Array.isArray(historyPayload) ? historyPayload : []);
        setMessage("Choose symptoms and launch the prediction engine.");
      } catch (bootstrapError) {
        setError(bootstrapError.message);
        setMessage("The app could not connect to the backend services.");
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  const filteredSymptoms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return symptoms.filter((symptom) => symptom.toLowerCase().includes(query));
  }, [search, symptoms]);

  function toggleSymptom(symptom) {
    setSelectedSymptoms((current) =>
      current.includes(symptom)
        ? current.filter((item) => item !== symptom)
        : [...current, symptom],
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!selectedSymptoms.length) {
      setError("Select at least one symptom to continue.");
      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("Analyzing symptom combinations and matching them with the trained model...");

    try {
      const response = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ symptoms: selectedSymptoms }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Prediction failed");
      }

      setResult(payload);
      setHistory((current) => [
        {
          _id: globalThis.crypto?.randomUUID?.() || `${Date.now()}`,
          predictedDisease: payload.prediction.disease,
          confidence: payload.prediction.confidence,
          specialist: payload.prediction.specialist,
          selectedSymptoms: payload.selectedSymptoms,
          createdAt: new Date().toISOString(),
        },
        ...current,
      ].slice(0, 8));
      setMessage("Prediction complete. Review the top match and the care guidance below.");
    } catch (submitError) {
      setError(submitError.message);
      setMessage("Prediction could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  function clearAll() {
    setSelectedSymptoms([]);
    setResult(null);
    setError("");
    setMessage("Selections cleared. Build a new symptom profile.");
  }

  const selectionPreview = selectedSymptoms.slice(0, 6);
  const statusLabel = error ? "Needs attention" : submitting ? "Analyzing" : "Ready";

  return h(
    "div",
    { className: "app-shell" },
    h("div", { className: "ambient ambient-one" }),
    h("div", { className: "ambient ambient-two" }),
    h(
      "section",
      { className: "hero-panel reveal reveal-1" },
      h(
        "div",
        { className: "hero-copy" },
        h(
          "div",
          { className: "eyebrow-row" },
          h("p", { className: "eyebrow" }, "PulsePredict AI"),
          h("span", { className: "status-pill" }, statusLabel),
        ),
        h("h1", null, "A striking disease prediction experience with smarter guidance."),
        h(
          "p",
          { className: "hero-text" },
          "Search symptoms, build a profile, and let the integrated ML engine surface likely conditions, care direction, and specialist guidance in a more premium interface.",
        ),
        h(
          "div",
          { className: "hero-actions" },
          h("button", { className: "primary-button hero-button", type: "button", onClick: () => globalThis.scrollTo?.({ top: 520, behavior: "smooth" }) }, "Explore Symptoms"),
          h("div", { className: "hero-note" }, "Live model-backed predictions"),
        ),
      ),
      h(
        "div",
        { className: "hero-stats" },
        h(
          "div",
          { className: "metric-card floating-card" },
          h("span", { className: "metric-label" }, "Symptoms in dataset"),
          h("strong", null, loading ? "..." : symptoms.length),
          h("p", null, "Full symptom vocabulary loaded from your training data."),
        ),
        h(
          "div",
          { className: "metric-card floating-card delayed-card" },
          h("span", { className: "metric-label" }, "Current selection"),
          h("strong", null, selectedSymptoms.length),
          h("p", null, selectedSymptoms.length ? "Your active symptom profile is ready." : "Select symptoms to begin."),
        ),
        h(
          "div",
          { className: "metric-card accent-card floating-card" },
          h("span", { className: "metric-label" }, "Prediction state"),
          h("strong", null, statusLabel),
          h("p", null, "Smooth transitions, fast feedback, and dynamic recommendations."),
        ),
      ),
    ),
    h(
      "section",
      { className: "workspace reveal reveal-2" },
      h(
        "form",
        { className: "glass-panel symptoms-panel", onSubmit: handleSubmit },
        h(
          "div",
          { className: "panel-head" },
          h(
            "div",
            null,
            h("h2", null, "Symptom Studio"),
            h("p", null, "Filter the medical symptom library and compose a strong signal for the model."),
          ),
          h("button", { type: "button", className: "ghost-button", onClick: clearAll }, "Reset"),
        ),
        h(
          "div",
          { className: "search-wrap" },
          h("input", {
            className: "search-input",
            type: "search",
            placeholder: "Search symptoms like fever, chest pain, headache...",
            value: search,
            onChange: (event) => setSearch(event.target.value),
          }),
        ),
        h(
          "div",
          { className: "selection-summary" },
          h("span", null, formatCount(selectedSymptoms.length, "symptom", "symptoms")),
          h("span", null, `Showing ${filteredSymptoms.length}`),
        ),
        h(
          "div",
          { className: "selected-preview" },
          selectionPreview.length
            ? selectionPreview.map((symptom) =>
                h("span", { className: "selected-pill", key: symptom }, symptom),
              )
            : h("span", { className: "selected-empty" }, "No symptoms selected yet"),
          selectedSymptoms.length > selectionPreview.length
            ? h("span", { className: "selected-pill more-pill" }, `+${selectedSymptoms.length - selectionPreview.length} more`)
            : null,
        ),
        h(
          "div",
          { className: "symptom-grid" },
          filteredSymptoms.slice(0, 160).map((symptom, index) =>
            h(
              "label",
              {
                key: symptom,
                className: `symptom-chip ${selectedSymptoms.includes(symptom) ? "selected" : ""}`,
                style: { animationDelay: `${Math.min(index * 0.015, 0.4)}s` },
              },
              h("input", {
                type: "checkbox",
                checked: selectedSymptoms.includes(symptom),
                onChange: () => toggleSymptom(symptom),
              }),
              h(
                "div",
                { className: "symptom-copy" },
                h("span", null, symptom),
                h("small", null, selectedSymptoms.includes(symptom) ? "Included in analysis" : "Tap to include"),
              ),
            ),
          ),
        ),
        h(
          "button",
          { className: `primary-button submit-button ${submitting ? "is-busy" : ""}`, type: "submit", disabled: submitting },
          submitting ? "Predicting..." : "Run Prediction Engine",
        ),
      ),
      h(
        "div",
        { className: "side-column" },
        h(
          "div",
          { className: "glass-panel result-panel highlight-panel" },
          h(
            "div",
            { className: "panel-head compact-head" },
            h("h2", null, "Prediction Output"),
            h("span", { className: `mini-badge ${error ? "danger-badge" : ""}` }, submitting ? "Live analysis" : "AI result"),
          ),
          h("p", { className: "status-line" }, message),
          error ? h("p", { className: "error-text" }, error) : null,
          result
            ? h(
                React.Fragment,
                null,
                h(
                  "div",
                  { className: "hero-result shimmer-card" },
                  h("span", { className: "result-tag" }, "Top match"),
                  h("h3", null, result.prediction.disease),
                  h("p", { className: "confidence" }, `${result.prediction.confidence}% confidence`),
                  h(
                    "div",
                    { className: "result-grid" },
                    h(
                      "div",
                      { className: "result-stat" },
                      h("span", null, "Specialist"),
                      h("strong", null, result.prediction.specialist),
                    ),
                    h(
                      "div",
                      { className: "result-stat" },
                      h("span", null, "Alternatives"),
                      h("strong", null, result.topPredictions.length),
                    ),
                  ),
                ),
                h("div", { className: "detail-block" }, h("h4", null, "Description"), h("p", null, result.prediction.description)),
                h("div", { className: "detail-block" }, h("h4", null, "Recommended specialist"), h("p", null, result.prediction.specialist)),
                h("div", { className: "detail-block" }, h("h4", null, "Precautions"), h("p", null, result.prediction.precautions)),
                h(
                  "div",
                  { className: "alternatives" },
                  result.topPredictions.map((item, index) =>
                    h(
                      "div",
                      {
                        className: "alternative-card",
                        key: item.disease,
                        style: { animationDelay: `${0.1 + index * 0.06}s` },
                      },
                      h(
                        "div",
                        null,
                        h("strong", null, item.disease),
                        h("small", null, item.specialist),
                      ),
                      h("span", { className: "alt-confidence" }, `${item.confidence}%`),
                    ),
                  ),
                ),
              )
            : h(
                "div",
                { className: "empty-state" },
                h("div", { className: "empty-orb" }),
                h("p", { className: "placeholder-copy" }, "Your prediction story will appear here with animated result cards and care guidance."),
              ),
        ),
        h(
          "div",
          { className: "glass-panel history-panel" },
          h(
            "div",
            { className: "panel-head compact-head" },
            h("h2", null, "Recent Predictions"),
            h("span", { className: "mini-badge" }, "Timeline"),
          ),
          history.length
            ? history.map((item, index) =>
                h(
                  "div",
                  {
                    className: "history-card",
                    key: item._id || `${item.predictedDisease}-${item.createdAt}`,
                    style: { animationDelay: `${0.12 + index * 0.05}s` },
                  },
                  h(
                    "div",
                    null,
                    h("strong", null, item.predictedDisease),
                    h("p", null, `${item.confidence}% confidence`),
                  ),
                  h("span", null, (item.selectedSymptoms || []).slice(0, 3).join(", ")),
                ),
              )
            : h("p", { className: "placeholder-copy" }, "Mongo-backed history will appear here when available."),
        ),
      ),
    ),
  );
}

export default App;
