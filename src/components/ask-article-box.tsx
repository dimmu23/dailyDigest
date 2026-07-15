"use client";

import { useState } from "react";

type AskAnswer = {
  answer: string;
  sourceBasis: "article" | "pdf" | "summary" | "mixed" | "not_available";
  confidence: "high" | "medium" | "low";
};

type ApiResponse =
  | { data: AskAnswer }
  | { error: { code: string; message: string } };

const QUICK_QUESTIONS = [
  "Why is this important for UPSC?",
  "Make 3 prelims facts.",
  "Which GS paper is relevant?",
  "Explain in simple words.",
  "What can be asked in mains?"
];

export function AskArticleBox({ releaseId }: { releaseId: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function ask(selectedQuestion = question) {
    const trimmed = selectedQuestion.trim();
    if (trimmed.length < 3) {
      setStatus("error");
      setMessage("Enter a question first.");
      return;
    }

    setQuestion(trimmed);
    setStatus("loading");
    setMessage("");
    setAnswer(null);

    try {
      const response = await fetch(`/api/releases/${releaseId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: trimmed })
      });
      const body = (await response.json()) as ApiResponse;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error.message : "Could not answer.");
      }
      setAnswer(body.data);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not answer.");
    }
  }

  return (
    <section className="ask-box">
      <p className="section-label">Ask this PIB release</p>
      <div className="ask-chips" aria-label="Suggested questions">
        {QUICK_QUESTIONS.map((item) => (
          <button
            className="ask-chip"
            type="button"
            key={item}
            onClick={() => void ask(item)}
            disabled={status === "loading"}
          >
            {item}
          </button>
        ))}
      </div>
      <form
        className="ask-form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <label htmlFor="article-question">Question</label>
        <div>
          <textarea
            id="article-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ask a source-grounded question about this release."
            disabled={status === "loading"}
          />
          <button className="button dark" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Asking..." : "Ask"}
          </button>
        </div>
      </form>
      {message ? <p className="ask-message error">{message}</p> : null}
      {answer ? (
        <div className="ask-answer">
          <p>{answer.answer}</p>
          <div className="ask-answer-meta">
            <span>Source: {answer.sourceBasis.replace("_", " ")}</span>
            <span>Confidence: {answer.confidence}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
