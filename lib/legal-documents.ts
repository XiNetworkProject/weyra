export type LegalDocument = {
  slug: string;
  title: string;
  summary: string;
  status: string;
  sections: Array<{
    title: string;
    paragraphs?: string[];
    bullets?: string[];
  }>;
  references?: Array<{ label: string; href: string }>;
};

export const LEGAL_DOCUMENTS: LegalDocument[] = [
  {
    slug: "cgu",
    title: "Conditions générales d’utilisation",
    summary: "Les règles d’accès à Weyra et les limites d’un service météo communautaire.",
    status: "Version bêta 0.1 - 26 août 2026",
    sections: [
      {
        title: "1. Objet",
        paragraphs: [
          "Weyra réunit une carte météo, des données provenant de fournisseurs identifiés et des contributions publiées par sa communauté. Ces conditions encadrent l’utilisation du service et de ses espaces de participation.",
          "Weyra est un service d’information et d’échange. Il ne remplace ni les messages des autorités, ni les services de secours, ni une expertise professionnelle adaptée à une situation dangereuse.",
        ],
      },
      {
        title: "2. Compte et accès",
        bullets: [
          "Fournir des informations de compte exactes et protéger ses moyens de connexion.",
          "Ne pas contourner les limites techniques, les contrôles d’accès ou les mesures de modération.",
          "Signaler rapidement tout accès non autorisé à son compte.",
          "Un compte peut être limité ou suspendu lorsqu’une mesure proportionnée est nécessaire à la sécurité du service ou de la communauté.",
        ],
      },
      {
        title: "3. Données météo",
        paragraphs: [
          "La source, l’heure et la fraîcheur doivent accompagner les données météo lorsqu’elles sont disponibles. Une observation radar décrit le passé récent ; une prévision ou un nowcast doit être présenté séparément et explicitement.",
          "La disponibilité, la couverture et la précision varient selon la source. Il appartient à chacun de vérifier les informations officielles avant toute décision engageant la sécurité des personnes ou des biens.",
        ],
      },
      {
        title: "4. Contributions",
        bullets: [
          "Publier uniquement un contenu licite, pertinent et présenté honnêtement.",
          "Ne pas exposer une adresse privée, une personne identifiable ou une information sensible sans base légitime.",
          "Respecter les droits d’auteur, le droit à l’image et les droits sur les médias transmis.",
          "Accepter qu’une contribution soit vérifiée, rendue moins visible, archivée ou supprimée selon la charte et la procédure de modération.",
        ],
      },
      {
        title: "5. Responsabilité et évolution",
        paragraphs: [
          "Weyra met en œuvre des moyens raisonnables pour maintenir le service, mais une interruption, un retard de données ou une erreur de fournisseur peut survenir. Les fonctions bêta peuvent évoluer, à condition de préserver les droits acquis et d’informer les membres lorsqu’un changement est substantiel.",
        ],
      },
      {
        title: "6. Éditeur et contact",
        paragraphs: [
          "Éditeur : projet Weyra. Contact fonctionnel : contact@weyra.cloud. L’identité juridique complète de l’éditeur, son adresse professionnelle et son directeur de publication restent à compléter avant l’ouverture de la bêta publique.",
          "Hébergement technique : infrastructure privée située en France. Les mentions d’hébergement définitives restent à compléter avant l’ouverture publique.",
        ],
      },
    ],
  },
  {
    slug: "confidentialite",
    title: "Politique de confidentialité",
    summary: "Ce que Weyra traite, pourquoi, pendant combien de temps et comment exercer ses droits.",
    status: "Version bêta 0.1 - 26 août 2026",
    sections: [
      {
        title: "1. Responsable et principes",
        paragraphs: [
          "Le projet Weyra agit comme responsable des traitements nécessaires à son service. Le contact vie privée prévu est privacy@weyra.cloud. L’identité juridique complète du responsable doit être ajoutée avant la bêta publique.",
          "Weyra applique la minimisation, la séparation des finalités et la limitation de conservation. Le service n’a pas vocation à vendre des profils, des positions ou des historiques de déplacement.",
        ],
      },
      {
        title: "2. Données traitées",
        bullets: [
          "Compte : adresse électronique, identifiant, profil public et préférences.",
          "Contributions : observations, messages, médias, réactions, signalements et historique de modération.",
          "Position : coordonnées choisies pour une observation ou un lieu suivi. Les observations publiques sont arrondies côté serveur ; la position source précise n’est pas destinée à être conservée.",
          "Technique : journaux de sécurité, identifiants de session, erreurs et métriques nécessaires au fonctionnement.",
          "Notifications : zones suivies, phénomènes et seuils choisis par le membre.",
        ],
      },
      {
        title: "3. Finalités et bases",
        bullets: [
          "Exécuter le service demandé : compte, carte personnalisée, publication et synchronisation.",
          "Intérêt légitime : sécurité, prévention des abus, mesure de fiabilité et amélioration non intrusive du service.",
          "Consentement : notifications facultatives, accès à la géolocalisation de l’appareil et usages optionnels clairement présentés.",
          "Obligation légale : conservation ou transmission strictement requise par une demande juridiquement valable.",
        ],
      },
      {
        title: "4. Destinataires et transferts",
        paragraphs: [
          "Les données sont accessibles aux membres selon leur visibilité, aux modérateurs habilités lorsque cela est nécessaire et aux prestataires techniques encadrés. Les fournisseurs de données météo reçoivent les seules requêtes techniques nécessaires, sans clé secrète exposée au navigateur.",
          "Tout transfert hors de l’Espace économique européen devra être identifié et encadré avant activation en production.",
        ],
      },
      {
        title: "5. Droits",
        paragraphs: [
          "Chaque personne peut demander l’accès, la rectification, l’effacement, la limitation, l’opposition et, lorsque les conditions sont réunies, la portabilité de ses données. Une demande peut être adressée à privacy@weyra.cloud. Une réclamation peut aussi être déposée auprès de la CNIL.",
        ],
      },
      {
        title: "6. Cookies et stockage local",
        paragraphs: [
          "Les cookies de session servent à l’authentification et à la sécurité. Le stockage local peut conserver des préférences et des démonstrations sur l’appareil. Aucun traceur publicitaire n’est prévu dans la bêta.",
        ],
      },
    ],
    references: [
      {
        label: "CNIL - droits des personnes",
        href: "https://www.cnil.fr/fr/passer-laction/les-droits-des-personnes-sur-leurs-donnees",
      },
      {
        label: "CNIL - géolocalisation et applications",
        href: "https://www.cnil.fr/fr/geolocalisation-applications-mobiles-quelles-regles",
      },
    ],
  },
  {
    slug: "charte-communautaire",
    title: "Charte communautaire",
    summary: "Une communauté météo utile, sourcée, accueillante et prudente lors des événements sévères.",
    status: "Version bêta 0.1 - 26 août 2026",
    sections: [
      {
        title: "Ce que Weyra encourage",
        bullets: [
          "Décrire ce qui est réellement visible, avec une heure, une zone et un niveau de confiance.",
          "Distinguer mesure, observation personnelle, analyse, hypothèse et prévision officielle.",
          "Ajouter du contexte utile : déplacement, impacts, visibilité et évolution.",
          "Corriger une erreur de bonne foi et accueillir les nouveaux membres sans mépris.",
        ],
      },
      {
        title: "Ce qui n’a pas sa place",
        bullets: [
          "Fausse alerte, donnée inventée, contenu trompeur ou source volontairement masquée.",
          "Harcèlement, menace, discrimination, humiliation ou attaque coordonnée.",
          "Publication d’une position sensible, d’un domicile ou d’une personne identifiable sans nécessité.",
          "Incitation à se mettre en danger pour photographier ou poursuivre un phénomène.",
          "Spam, publicité dissimulée ou réutilisation d’un média sans droit.",
        ],
      },
      {
        title: "Modération progressive",
        paragraphs: [
          "Les réponses possibles vont de l’explication à la limitation, l’avertissement, la suspension ou la suppression. La gravité, le contexte, la répétition et les risques réels sont pris en compte. Une décision importante doit être motivée, journalisée et contestable.",
        ],
      },
      {
        title: "Épisodes dangereux",
        paragraphs: [
          "Pendant un épisode sévère, les informations officielles et les consignes de sécurité priment. La recherche d’images ne justifie jamais une prise de risque. En cas d’urgence, contacter les services de secours compétents.",
        ],
      },
    ],
    references: [
      {
        label: "EUR-Lex - règlement sur les services numériques",
        href: "https://eur-lex.europa.eu/FR/legal-content/summary/digital-services-act.html",
      },
    ],
  },
  {
    slug: "droits-medias",
    title: "Droits des photos et médias",
    summary: "Les engagements nécessaires avant de partager une photo, une vidéo ou un document.",
    status: "Version bêta 0.1 - 26 août 2026",
    sections: [
      {
        title: "Tes droits restent les tiens",
        paragraphs: [
          "Le membre conserve ses droits sur son média. Il accorde à Weyra une autorisation non exclusive, mondiale et limitée à l’hébergement, la modération, l’affichage et le partage au sein des fonctions choisies. Cette autorisation prend fin après suppression, sous réserve des délais techniques de sauvegarde et des obligations légales.",
        ],
      },
      {
        title: "Avant l’envoi",
        bullets: [
          "Être l’auteur du média ou disposer d’une autorisation suffisante.",
          "Respecter le droit à l’image et éviter les personnes, plaques, domiciles ou écrans identifiables.",
          "Ne pas retirer une signature, une licence ou une attribution obligatoire.",
          "Indiquer une retouche substantielle ou une génération artificielle ; un tel média ne doit jamais être présenté comme une observation brute.",
        ],
      },
      {
        title: "Modération et retrait",
        paragraphs: [
          "Un média reste privé pendant son traitement et peut être refusé ou mis en quarantaine. Une demande liée au droit d’auteur, à la vie privée ou au droit à l’image peut être adressée à media@weyra.cloud avec l’URL, le motif et les éléments permettant d’examiner la demande.",
        ],
      },
      {
        title: "Réutilisation par des tiers",
        paragraphs: [
          "La visibilité publique n’emporte pas une licence générale de réutilisation. Les fonctions de partage renvoient vers Weyra et l’auteur ; toute autre exploitation nécessite l’accord approprié.",
        ],
      },
    ],
  },
  {
    slug: "donnees",
    title: "Conservation, suppression et export",
    summary: "Le cycle de vie prévu pour les comptes, observations, médias et journaux techniques.",
    status: "Politique bêta proposée - 26 août 2026",
    sections: [
      {
        title: "Durées proposées",
        bullets: [
          "Compte et préférences : jusqu’à la suppression du compte ou après 24 mois d’inactivité, après notification lorsque cela est possible.",
          "Observation live : visible sur la carte pendant la durée choisie ; conservation communautaire jusqu’à 12 mois si elle reste utile, sauf suppression anticipée.",
          "Média : même cycle que le contenu auquel il est rattaché ; retrait immédiat de la visibilité après suppression.",
          "Messages et publications : jusqu’à suppression par le membre ou fin de l’espace concerné, sous réserve des besoins de modération.",
          "Signalements, décisions et recours : 24 mois après clôture pour assurer la cohérence et traiter les contestations.",
          "Journaux de sécurité : 12 mois maximum, sauf incident nécessitant une conservation justifiée plus longue.",
          "Sauvegardes : purge visée sous 30 jours après suppression logique.",
        ],
      },
      {
        title: "Suppression",
        paragraphs: [
          "La suppression d’une observation la masque immédiatement du flux public. Son média est ensuite supprimé du stockage ; si le nettoyage technique échoue, le contenu demeure inaccessible au public et le nettoyage est retenté.",
          "La suppression d’un compte doit déclencher une période de confirmation, puis la suppression ou l’anonymisation des données qui ne sont plus nécessaires. Les éléments légalement requis ou indispensables à une procédure de modération sont isolés et soumis à une durée propre.",
        ],
      },
      {
        title: "Export",
        paragraphs: [
          "L’export prévu regroupe le profil, les préférences, les lieux suivis, les observations, les publications, les médias, les réactions et les décisions de modération concernant le membre dans un format structuré. La fonction automatisée n’est pas encore disponible dans la pré-bêta ; une demande peut être adressée à privacy@weyra.cloud.",
        ],
      },
      {
        title: "Validation avant bêta",
        paragraphs: [
          "Ces durées constituent une politique produit initiale. Elles doivent être validées au regard des finalités réellement activées, des contrats d’hébergement et des obligations applicables avant l’ouverture publique.",
        ],
      },
    ],
    references: [
      {
        label: "CNIL - durées de conservation",
        href: "https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees",
      },
      {
        label: "CNIL - préparer l’exercice des droits",
        href: "https://www.cnil.fr/fr/preparer-lexercice-des-droits-des-personnes",
      },
    ],
  },
];

export function legalDocument(slug: string) {
  return LEGAL_DOCUMENTS.find((document) => document.slug === slug) ?? null;
}
