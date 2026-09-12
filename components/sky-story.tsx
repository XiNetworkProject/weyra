"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pause,
  Play,
  Maximize2,
  ArrowDown,
  Compass,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Observation } from "@/lib/content";

export function Horizon({
  onAtlas,
  onImmersion,
  onObserve,
}: {
  onAtlas: () => void;
  onImmersion: () => void;
  onObserve: () => void;
}) {
  return (
    <section className="horizon-hero">
      <div className="horizon-photo">
        <img src="/images/arcus.jpg" alt="Un ciel d’orage au-dessus de la campagne" />
      </div>
      <div className="horizon-shade" />
      <div className="horizon-intro">
        <span className="horizon-eyebrow">
          <span className="signal-dot" />
          POUR CEUX QUI LÈVENT LES YEUX
        </span>
        <h1>
          Un même ciel.
          <br />
          <em>Mille façons</em>
          <br />
          de le vivre.
        </h1>
        <p>
          Explorez les phénomènes. Partagez l’instant.
          <br />
          Retrouvez ceux qui regardent dans la même direction.
        </p>
        <div className="horizon-actions">
          <button className="primary" onClick={onAtlas}>
            Entrer dans Atlas
            <ArrowUpRight size={19} />
          </button>
          <button className="horizon-play" onClick={onImmersion}>
            <span>
              <Play size={16} />
            </span>
            Se laisser porter
          </button>
        </div>
      </div>
      <div className="horizon-side">
        <span>01 — L’INSTANT WEYRA</span>
        <button onClick={onImmersion}>
          <Maximize2 size={22} />
          <span>
            Le ciel prend
            <br />
            une autre dimension.
          </span>
          <ArrowUpRight size={22} />
        </button>
        <small>Photographie illustrative · Greg Johnson</small>
      </div>
      <div className="horizon-bottom">
        <span>
          <Compass size={17} />
          LE MONDE EST PLUS BEAU, LES YEUX OUVERTS.
        </span>
        <button onClick={onObserve}>
          Et vous, que voyez-vous ?<ArrowUpRight size={16} />
        </button>
      </div>
      <div className="horizon-scroll">
        <ArrowDown size={15} />
        La suite se partage
      </div>
    </section>
  );
}

export default function SkyStory({
  items,
  index,
  open,
  onClose,
  onMap,
  onDetails,
}: {
  items: Observation[];
  index: number;
  open: boolean;
  onClose: () => void;
  onMap: (o: Observation) => void;
  onDetails: (o: Observation) => void;
}) {
  const [current, setCurrent] = useState(index),
    [playing, setPlaying] = useState(true);
  const count = items.length;
  useEffect(() => {
    if (open) {
      setCurrent(index);
      setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    }
  }, [index, open]);
  useEffect(() => {
    if (!open || !playing || count < 2) return;
    const timer = setInterval(() => setCurrent((c) => (c + 1) % count), 8000);
    return () => clearInterval(timer);
  }, [open, playing, count, current]);
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrent((c) => (c + 1) % count);
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrent((c) => (c - 1 + count) % count);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, count]);
  const observation = items[current % Math.max(count, 1)];
  if (!observation) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent fullScreen className="sky-story" data-playing={playing} aria-describedby="story-description">
        <div className="story-photograph" key={observation.id}>
          <img src={observation.image || "/images/clouds.jpg"} alt={observation.title} />
        </div>
        <div className="story-shade" />
        <div className="story-top">
          <span>
            weyra <b>/ IMMERSION</b>
          </span>
          <span>{observation.demo ? "PHOTOGRAPHIE ILLUSTRATIVE" : "UN REGARD PARTAGÉ"}</span>
        </div>
        <div className="story-copy" key={observation.id + "copy"}>
          <span className="horizon-eyebrow">
            {observation.phenomenon} <i /> {String(current + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
          </span>
          <DialogTitle>
            {observation.title}
            <em>.</em>
          </DialogTitle>
          <DialogDescription id="story-description">
            {observation.demo
              ? "Une fenêtre sur le ciel. Une invitation à prendre le temps de regarder."
              : observation.description}
          </DialogDescription>
          <div className="story-actions">
            <button className="primary" onClick={() => onMap(observation)}>
              <MapPin size={17} />
              Retrouver sur Atlas
              <ArrowUpRight size={17} />
            </button>
            <button className="story-detail" onClick={() => onDetails(observation)}>
              Voir l’observation
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        <div className="story-navigation">
          <button aria-label="Instant précédent" onClick={() => setCurrent((c) => (c - 1 + count) % count)}>
            <ChevronLeft size={22} />
          </button>
          <button
            aria-label={playing ? "Suspendre le voyage" : "Lancer le voyage"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button aria-label="Instant suivant" onClick={() => setCurrent((c) => (c + 1) % count)}>
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="story-progress">
          {items.map((o, i) => (
            <button
              aria-label={"Voir " + o.title}
              aria-current={i === current ? "true" : undefined}
              className={i === current ? "current" : i < current ? "past" : ""}
              key={o.id}
              onClick={() => setCurrent(i)}
            >
              <span key={i === current ? current + "active" : "idle"} />
            </button>
          ))}
        </div>
        <span className="story-credit">
          {observation.demo ? "Les photos d’exemple ne décrivent pas la météo actuelle." : observation.author}
        </span>
      </DialogContent>
    </Dialog>
  );
}
