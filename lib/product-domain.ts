import type { ObservationCategory } from "@/lib/types";

export const WEYRA_SPACE_VALUES = [
  "home",
  "atlas",
  "explore",
  "communities",
  "messages",
  "notifications",
  "profile",
  "settings",
  "learn",
  // Legacy routes remain readable while the new shell replaces their visible entry points.
  "around",
  "feed",
  "activity",
  "rooms",
  "alerts",
] as const;

export type WeyraSpace = (typeof WEYRA_SPACE_VALUES)[number];

export type ProductAuthor = {
  id: string;
  displayName: string;
  handle: string;
  initials: string;
  region: string;
  role: "member" | "reliable" | "creator" | "association";
  accent: string;
};

export type ProductProfile = ProductAuthor & {
  bio: string;
  interests: ObservationCategory[];
  joinedAt: string;
  observationCount: number;
  confirmedCount: number;
};

export type ProductPost = {
  id: string;
  authorId: string;
  kind: "observation" | "photo" | "analysis" | "question" | "recap";
  title: string;
  body: string;
  imageUrl?: string;
  place: string;
  lat: number;
  lon: number;
  phenomena: ObservationCategory[];
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  observationId?: string;
  useful?: boolean;
};

export type ProductComment = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type StormRoom = {
  id: string;
  title: string;
  shortTitle: string;
  summary: string;
  area: string;
  phenomenon: ObservationCategory;
  status: "watching" | "active" | "archived";
  startedAt: string;
  updatedAt: string;
  lat: number;
  lon: number;
  participantCount: number;
  observationCount: number;
  messageCount: number;
  sourceCount: number;
  imageUrl: string;
};

export type RoomMessage = {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  kind: "message" | "confirmation" | "source";
};

export type CommunityAccess = "public" | "request" | "private";
export type CommunityTemplate =
  | "local"
  | "weather"
  | "association"
  | "media"
  | "field"
  | "photography"
  | "event";
export type CommunitySpaceType =
  | "discussion"
  | "observations"
  | "atlas"
  | "media"
  | "event"
  | "announcement"
  | "resource";
export type CommunityNotificationMode = "all" | "essential" | "custom" | "silent";

export type Community = {
  id: string;
  slug: string;
  name: string;
  initials: string;
  description: string;
  about: string;
  territory: string;
  themes: string[];
  access: CommunityAccess;
  template: CommunityTemplate;
  memberCount: number;
  activeCount: number;
  observationCount: number;
  verified: boolean;
  bannerUrl: string;
  accent: string;
  center: { lat: number; lon: number };
  rules: string[];
  featuredSpaceIds: string[];
  createdLocally?: boolean;
};

export type CommunitySection = {
  id: string;
  communityId: string;
  name: string;
  order: number;
};

export type CommunitySpace = {
  id: string;
  communityId: string;
  sectionId: string;
  name: string;
  description: string;
  type: CommunitySpaceType;
  visibility: "public" | "members" | "role" | "private";
  unreadCount: number;
  live?: boolean;
  archived?: boolean;
  createdLocally?: boolean;
};

export type CommunityEvent = {
  id: string;
  communityId: string;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  place: string;
  access: "public" | "members" | "private";
  format: "online" | "onsite" | "hybrid";
  participantCount: number;
  interestedCount: number;
  imageUrl: string;
  lat: number;
  lon: number;
};

export type CommunityMember = {
  id: string;
  communityId: string;
  displayName: string;
  handle: string;
  initials: string;
  roleId: string;
  joinedAt: string;
  contributionCount: number;
  presence: "active" | "available" | "busy" | "offline";
  accent: string;
};

export type CommunityRole = {
  id: string;
  communityId: string;
  name: string;
  summary: string;
  color: string;
  priority: number;
  critical: boolean;
  permissions: string[];
};

export type CommunityMessage = {
  id: string;
  communityId: string;
  spaceId: string;
  authorId: string;
  authorName: string;
  authorInitials: string;
  body: string;
  createdAt: string;
  kind: "message" | "announcement" | "observation" | "resource";
  replyToId?: string;
  reactions?: Record<string, number>;
  local?: boolean;
};

export type DirectConversation = {
  id: string;
  participantIds: string[];
  participantNames: string[];
  participantInitials: string[];
  title: string;
  preview: string;
  updatedAt: string;
  unreadCount: number;
  request: boolean;
  accent: string;
};

export type DirectMessage = {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  local?: boolean;
};

export type CommunityNotification = {
  id: string;
  communityId?: string;
  type: "reply" | "mention" | "event" | "observation" | "membership" | "moderation" | "security";
  priority: "critical" | "high" | "normal" | "low";
  title: string;
  body: string;
  createdAt: string;
  targetSpaceId?: string;
  targetObservationId?: string;
};

export type ModerationCase = {
  id: string;
  communityId: string;
  priority: "urgent" | "high" | "normal" | "low";
  category: "safety" | "harassment" | "misinformation" | "spam" | "quality";
  title: string;
  summary: string;
  reportedContent: string;
  reportedMemberId: string;
  createdAt: string;
  status: "open" | "reviewing" | "resolved";
  previousActions: number;
};

export type LocalModerationDecision = {
  action: "educate" | "limit" | "warn" | "suspend" | "ban" | "dismiss";
  decidedAt: string;
};

export type LearningLesson = {
  id: string;
  category: "radar" | "clouds" | "safety" | "winter" | "wind";
  title: string;
  summary: string;
  durationMinutes: number;
  level: "Découvrir" | "Comprendre" | "Approfondir";
  imageUrl: string;
  paragraphs: string[];
  keyPoints: string[];
};

export type NotebookEntry = {
  id: string;
  title: string;
  note: string;
  place: string;
  createdAt: string;
  imageUrl?: string;
  observationId?: string;
};

export type AlertPreferences = {
  enabled: boolean;
  radiusKm: number;
  quietHours: boolean;
  quietFrom: string;
  quietTo: string;
  phenomena: ObservationCategory[];
  communityActivity: boolean;
  officialInformation: boolean;
  dailyRecap: boolean;
};

export type ProductSettings = {
  compactMode: boolean;
  reduceMotion: boolean;
  highContrast: boolean;
  temperatureUnit: "celsius" | "fahrenheit";
  windUnit: "kmh" | "ms";
  locale: "fr-FR" | "en-GB";
};

export type WeyraProductState = {
  version: 3;
  demoMode: boolean;
  onboardingComplete: boolean;
  profile: ProductProfile;
  remoteAuthors: ProductAuthor[];
  remotePosts: ProductPost[];
  likedPostIds: string[];
  sharedPostIds: string[];
  bookmarkedPostIds: string[];
  followedAuthorIds: string[];
  joinedRoomIds: string[];
  completedLessonIds: string[];
  readActivityIds: string[];
  hiddenObservationIds: string[];
  reportedObservationIds: string[];
  commentsByTarget: Record<string, ProductComment[]>;
  roomMessages: RoomMessage[];
  notebookEntries: NotebookEntry[];
  joinedCommunityIds: string[];
  favoriteCommunityIds: string[];
  followedSpaceIds: string[];
  communityNotificationModes: Record<string, CommunityNotificationMode>;
  communityMessages: CommunityMessage[];
  directMessages: DirectMessage[];
  readNotificationIds: string[];
  memberRoleOverrides: Record<string, string>;
  moderationDecisions: Record<string, LocalModerationDecision>;
  createdCommunities: Community[];
  createdCommunitySpaces: CommunitySpace[];
  alertPreferences: AlertPreferences;
  settings: ProductSettings;
};

export type ProductRepository = {
  load(): WeyraProductState;
  save(state: WeyraProductState): void;
  reset(): WeyraProductState;
  subscribe(listener: (state: WeyraProductState) => void): () => void;
};
