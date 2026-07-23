"use client";

import { useMemo, useState } from "react";
import {
  IconArrowLeft,
  IconBook,
  IconCheck,
  IconChevronRight,
  IconClock,
  IconShield,
} from "@/components/atlas/icons";
import {
  DemoNotice,
  ProductEmpty,
  ProductSectionHeading,
} from "@/components/product/ProductShared";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";
import { PRODUCT_LESSONS } from "@/lib/product-fixtures";
import type { LearningLesson } from "@/lib/product-domain";

type LessonCategory = "all" | LearningLesson["category"];

const CATEGORY_LABEL: Record<LessonCategory, string> = {
  all: "Tout",
  radar: "Radar",
  clouds: "Nuages",
  safety: "Sécurité",
  winter: "Précipitations",
  wind: "Vent",
};

const QUIZ = {
  question: "Une image radar DBZH indique directement une quantité de pluie en mm/h.",
  answers: ["Vrai", "Faux", "Seulement la nuit"],
  correct: 1,
};

export default function LearnView() {
  const { state, completeLesson } = useWeyraProduct();
  const [category, setCategory] = useState<LessonCategory>("all");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const selectedLesson = PRODUCT_LESSONS.find((lesson) => lesson.id === selectedLessonId) ?? null;
  const lessons = useMemo(
    () => category === "all" ? PRODUCT_LESSONS : PRODUCT_LESSONS.filter((lesson) => lesson.category === category),
    [category],
  );
  const progress = Math.round((state.completedLessonIds.length / PRODUCT_LESSONS.length) * 100);

  if (selectedLesson) {
    const completed = state.completedLessonIds.includes(selectedLesson.id);
    return (
      <div className="product-view product-lesson-detail">
        <button className="product-back-button" onClick={() => setSelectedLessonId(null)}><IconArrowLeft />Bibliothèque</button>
        <header className="product-lesson-hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={selectedLesson.imageUrl} alt="" />
          <div>
            <span>{CATEGORY_LABEL[selectedLesson.category]} · {selectedLesson.level}</span>
            <h2>{selectedLesson.title}</h2>
            <p>{selectedLesson.summary}</p>
            <small><IconClock />{selectedLesson.durationMinutes} min de lecture</small>
          </div>
        </header>
        <div className="product-lesson-detail__layout">
          <article>
            {selectedLesson.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            <section className="product-lesson-keypoints">
              <span><IconBook /></span>
              <div><h3>À retenir</h3>{selectedLesson.keyPoints.map((point) => <p key={point}><IconCheck />{point}</p>)}</div>
            </section>
            {selectedLesson.category === "safety" && (
              <section className="product-lesson-safety">
                <IconShield />
                <p><b>Information de sécurité</b>Weyra contextualise mais ne remplace jamais les consignes des autorités et services compétents.</p>
              </section>
            )}
          </article>
          <aside>
            <span>Progression</span>
            <strong>{completed ? "Terminée" : "Prête à lire"}</strong>
            <p>Marque cette fiche comme terminée pour suivre ton parcours personnel.</p>
            <button className={`product-primary-button${completed ? " is-complete" : ""}`} onClick={() => completeLesson(selectedLesson.id)}>
              <IconCheck />{completed ? "Fiche terminée" : "J'ai terminé"}
            </button>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="product-view product-learn">
      <ProductSectionHeading
        eyebrow="Comprendre le ciel"
        title="Apprendre au bon moment"
        copy="Des formats courts reliés aux phénomènes visibles, sans jargon inutile ni raccourci trompeur."
        action={<DemoNotice compact />}
      />

      <section className="product-learning-progress">
        <div><span>Ton parcours</span><strong>{state.completedLessonIds.length}/{PRODUCT_LESSONS.length} fiches</strong><p>Comprendre les phénomènes améliore la qualité des observations.</p></div>
        <div className="product-learning-progress__ring" style={{ "--progress": `${progress * 3.6}deg` } as never}><span>{progress}%</span></div>
      </section>

      <div className="product-segmented product-segmented--wrap">
        {(Object.keys(CATEGORY_LABEL) as LessonCategory[]).map((item) => (
          <button key={item} className={category === item ? "is-active" : ""} onClick={() => setCategory(item)}>{CATEGORY_LABEL[item]}</button>
        ))}
      </div>

      <div className="product-learn__layout">
        <div className="product-lesson-grid">
          {lessons.map((lesson) => {
            const completed = state.completedLessonIds.includes(lesson.id);
            return (
              <article className="product-lesson-card" key={lesson.id}>
                <button onClick={() => setSelectedLessonId(lesson.id)} className="product-lesson-card__media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={lesson.imageUrl} alt="" />
                  {completed && <span><IconCheck />Terminée</span>}
                </button>
                <div>
                  <small>{CATEGORY_LABEL[lesson.category]} · {lesson.level}</small>
                  <h3>{lesson.title}</h3>
                  <p>{lesson.summary}</p>
                  <button onClick={() => setSelectedLessonId(lesson.id)}>Lire la fiche <IconChevronRight /></button>
                </div>
              </article>
            );
          })}
          {!lessons.length && <ProductEmpty icon={<IconBook />} title="Aucune fiche">Choisis une autre catégorie.</ProductEmpty>}
        </div>

        <aside className="product-quiz">
          <span>Question minute</span>
          <h3>{QUIZ.question}</h3>
          <div>
            {QUIZ.answers.map((answer, index) => (
              <button
                key={answer}
                className={quizAnswer === index ? index === QUIZ.correct ? "is-correct" : "is-wrong" : ""}
                onClick={() => setQuizAnswer(index)}
                disabled={quizAnswer !== null}
              >
                <i>{String.fromCharCode(65 + index)}</i>{answer}
                {quizAnswer === index && <IconCheck />}
              </button>
            ))}
          </div>
          {quizAnswer !== null && (
            <p className={quizAnswer === QUIZ.correct ? "is-correct" : "is-wrong"}>
              {quizAnswer === QUIZ.correct
                ? "Exact. DBZH mesure la réflectivité, pas directement un débit de pluie."
                : "Pas tout à fait. DBZH décrit la réflectivité du signal radar."}
            </p>
          )}
          {quizAnswer !== null && <button className="product-quiz__retry" onClick={() => setQuizAnswer(null)}>Rejouer</button>}
        </aside>
      </div>
    </div>
  );
}
