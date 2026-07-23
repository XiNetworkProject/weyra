"use client";

import { useState } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconChevronRight,
  IconCompass,
  IconRadar,
  IconUsers,
} from "@/components/atlas/icons";
import { useWeyraProduct } from "@/components/product/WeyraProductProvider";

const STEPS = [
  {
    eyebrow: "Bienvenue dans Weyra",
    title: "Comprendre ce qui se passe, ensemble",
    copy: "Weyra réunit une carte météo vivante et des communautés territoriales pour relier les données aux réalités du terrain.",
    image: "/media/observations/arcus-champs.webp",
    icon: IconRadar,
    points: ["Atlas météo en temps réel", "Communautés par territoire", "Contexte local immédiatement utile"],
  },
  {
    eyebrow: "Personnaliser",
    title: "Construis ton paysage local",
    copy: "Rejoins les territoires qui comptent pour toi, suis leurs espaces et choisis le niveau de notifications adapté à chaque communauté.",
    image: "/media/observations/averse-route.webp",
    icon: IconCompass,
    points: ["Communautés à rejoindre", "Espaces à suivre", "Notifications maîtrisées"],
  },
  {
    eyebrow: "Agir ensemble",
    title: "Observe, échange et contribue",
    copy: "Publie une observation, participe aux discussions et retrouve les événements, médias et ressources de ton territoire.",
    image: "/media/observations/foudre-lointaine.webp",
    icon: IconUsers,
    points: ["Position approximative par défaut", "Contributions clairement identifiées", "Données conservées localement pour cette version"],
  },
] as const;

export default function WeyraOnboarding() {
  const { ready, state, completeOnboarding } = useWeyraProduct();
  const [step, setStep] = useState(0);
  if (!ready || state.onboardingComplete) return null;
  const current = STEPS[step];
  const StepIcon = current.icon;

  return (
    <section className="weyra-onboarding" aria-label="Découvrir Weyra">
      <div className="weyra-onboarding__visual">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={current.image} alt="" key={current.image} />
        <div />
        <header><b>weyra</b><span>ATLAS</span></header>
        <p><StepIcon /><span>{step + 1}</span> / {STEPS.length}</p>
      </div>
      <div className="weyra-onboarding__content">
        <button className="weyra-onboarding__skip" onClick={completeOnboarding}>Passer</button>
        <div className="weyra-onboarding__copy" key={current.title}>
          <span>{current.eyebrow}</span>
          <h1>{current.title}</h1>
          <p>{current.copy}</p>
          <div>{current.points.map((point) => <span key={point}><IconCheck />{point}</span>)}</div>
        </div>
        <footer>
          <div className="weyra-onboarding__dots">{STEPS.map((_, index) => <i key={index} className={index === step ? "is-active" : index < step ? "is-done" : ""} />)}</div>
          <div>
            {step > 0 && <button className="product-secondary-button" onClick={() => setStep((currentStep) => currentStep - 1)}><IconArrowLeft />Retour</button>}
            <button className="product-primary-button" onClick={() => step < STEPS.length - 1 ? setStep((currentStep) => currentStep + 1) : completeOnboarding()}>
              {step < STEPS.length - 1 ? <>Continuer<IconChevronRight /></> : <>Entrer dans Weyra<IconRadar /></>}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
