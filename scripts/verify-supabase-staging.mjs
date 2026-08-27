import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_CONFIRMATION = "I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
const environment = process.env.WEYRA_SUPABASE_ENVIRONMENT?.trim();
const confirmation = process.env.WEYRA_SUPABASE_STAGING_CONFIRM?.trim();

if (!url || !publishableKey || !secretKey) {
  throw new Error("Supabase staging URL, publishable key and secret key are required.");
}
if (environment !== "staging" || confirmation !== REQUIRED_CONFIRMATION) {
  throw new Error(
    `Refusing to create test data. Set WEYRA_SUPABASE_ENVIRONMENT=staging and WEYRA_SUPABASE_STAGING_CONFIRM=${REQUIRED_CONFIRMATION}.`,
  );
}

const runId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const password = `Weyra-${crypto.randomUUID()}-Aa9!`;
const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

function userClient() {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stage(name, details = {}) {
  console.log(JSON.stringify({ level: "info", event: "supabase_staging_check", stage: name, ...details }));
}

async function createTestUser(suffix) {
  const email = `weyra-staging-${runId}-${suffix}@example.invalid`;
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Weyra QA ${suffix.toUpperCase()}` },
  });
  if (result.error || !result.data.user) throw result.error ?? new Error("Test user creation failed.");
  return { id: result.data.user.id, email };
}

async function signIn(client, user) {
  const result = await client.auth.signInWithPassword({ email: user.email, password });
  if (result.error || result.data.user?.id !== user.id) {
    throw result.error ?? new Error("Test user sign-in failed.");
  }
}

async function waitForRealtime(client, authorId) {
  let finish;
  const received = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime observation event timed out.")), 12_000);
    finish = (value) => {
      clearTimeout(timeout);
      resolve(value);
    };
  });
  const channel = client
    .channel(`weyra-staging-${runId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "observations", filter: `author_id=eq.${authorId}` },
      (payload) => finish(payload),
    );
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Realtime subscription timed out.")), 12_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(`Realtime subscription failed: ${status}`));
      }
    });
  });
  return { channel, received };
}

let userA = null;
let userB = null;
let clientA = null;
let clientB = null;
let observationId = null;
let realtimeObservationId = null;
let mediaId = null;
let reportId = null;
let caseId = null;
let objectPath = null;
let realtimeChannel = null;

try {
  stage("start", { runId });
  userA = await createTestUser("a");
  userB = await createTestUser("b");
  clientA = userClient();
  clientB = userClient();
  await Promise.all([signIn(clientA, userA), signIn(clientB, userB)]);
  stage("auth_two_accounts_ok");

  objectPath = `${userA.id}/${crypto.randomUUID()}/pixel.png`;
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = await clientA.storage
    .from("weyra-observation-uploads")
    .upload(objectPath, onePixelPng, { contentType: "image/png", upsert: false });
  if (upload.error) throw upload.error;

  const media = await clientA
    .from("media_assets")
    .insert({
      owner_id: userA.id,
      bucket_id: "weyra-observation-uploads",
      object_path: objectPath,
      kind: "image",
      visibility: "private",
      mime_type: "image/png",
      byte_size: onePixelPng.byteLength,
      alt_text: "Pixel de verification staging",
      rights_confirmed: true,
      metadata: { runId },
    })
    .select("id,moderation_status")
    .single();
  if (media.error || !media.data) throw media.error ?? new Error("Media registration failed.");
  mediaId = media.data.id;
  assert(media.data.moderation_status === "pending", "New media must enter pending moderation.");
  stage("storage_owner_upload_ok");

  observationId = crypto.randomUUID();
  const observation = await clientA
    .from("observations")
    .insert({
      id: observationId,
      author_id: userA.id,
      nickname_snapshot: "Weyra QA A",
      primary_category: "orage",
      phenomena: ["orage", "foudre"],
      intensity: 4,
      details: `Staging verification ${runId}`,
      media_id: mediaId,
      latitude: 50.632987,
      longitude: 3.057321,
      location_precision_m: 150,
      place: "Lille",
      visibility: "public",
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      is_demo: true,
    })
    .select("id,status,latitude,longitude,is_demo")
    .single();
  if (observation.error || !observation.data) {
    throw observation.error ?? new Error("Observation creation failed.");
  }
  assert(observation.data.status === "pending", "New observation must be pending.");
  assert(
    observation.data.latitude === 50.633 && observation.data.longitude === 3.057,
    "Coordinates were not rounded server-side.",
  );
  assert(observation.data.is_demo === false, "Authenticated users must not create demo observations.");

  const hiddenFromB = await clientB.from("observations").select("id").eq("id", observationId);
  if (hiddenFromB.error) throw hiddenFromB.error;
  assert(hiddenFromB.data.length === 0, "A pending observation leaked to another account.");
  const foreignDownload = await clientB.storage.from("weyra-observation-uploads").download(objectPath);
  assert(Boolean(foreignDownload.error), "Private media leaked before moderation.");
  stage("observation_rls_and_rounding_ok");

  const realtime = await waitForRealtime(clientA, userA.id);
  realtimeChannel = realtime.channel;
  realtimeObservationId = crypto.randomUUID();
  const realtimeInsert = await clientA.from("observations").insert({
    id: realtimeObservationId,
    author_id: userA.id,
    nickname_snapshot: "Weyra QA A",
    primary_category: "pluie",
    phenomena: ["pluie"],
    intensity: 2,
    details: "Realtime staging verification",
    latitude: 50.65,
    longitude: 3.08,
    location_precision_m: 150,
    place: "Lille",
    visibility: "public",
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    is_demo: false,
  });
  if (realtimeInsert.error) throw realtimeInsert.error;
  const realtimePayload = await realtime.received;
  assert(realtimePayload?.new?.id === realtimeObservationId, "Realtime delivered an unexpected row.");
  stage("realtime_authenticated_event_ok");

  const promoteModerator = await admin.from("profiles").update({ role: "moderator" }).eq("id", userB.id);
  if (promoteModerator.error) throw promoteModerator.error;
  const moderationQueue = await clientB
    .from("observations")
    .select("id")
    .eq("id", observationId)
    .eq("status", "pending")
    .single();
  if (moderationQueue.error || moderationQueue.data?.id !== observationId) {
    throw moderationQueue.error ?? new Error("Moderator cannot read the pending observation.");
  }
  const moderation = await clientB.rpc("moderate_observation", {
    target_observation_id: observationId,
    review_decision: "approve",
    review_reason: `Staging verification ${runId}`,
  });
  if (moderation.error || moderation.data?.status !== "published") {
    throw moderation.error ?? new Error("Observation moderation failed.");
  }

  const visibleToB = await clientB.from("observations").select("id").eq("id", observationId).single();
  if (visibleToB.error || visibleToB.data?.id !== observationId) {
    throw visibleToB.error ?? new Error("Published observation is not visible.");
  }
  const approvedDownload = await clientB.storage.from("weyra-observation-uploads").download(objectPath);
  if (approvedDownload.error) throw approvedDownload.error;
  stage("moderation_rpc_and_public_media_ok");

  const report = await clientB
    .from("content_reports")
    .insert({
      reporter_id: userB.id,
      observation_id: observationId,
      category: "quality",
      details: `Staging report ${runId}`,
    })
    .select("id,status")
    .single();
  if (report.error || !report.data) throw report.error ?? new Error("Report creation failed.");
  reportId = report.data.id;
  assert(report.data.status === "open", "Report must be open.");
  const moderationCase = await admin.from("moderation_cases").select("id").eq("report_id", reportId).single();
  if (moderationCase.error || !moderationCase.data) {
    throw moderationCase.error ?? new Error("Moderation case was not created.");
  }
  caseId = moderationCase.data.id;
  stage("report_and_moderation_case_ok");

  const hide = await clientA
    .from("observations")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", observationId);
  if (hide.error) throw hide.error;
  const hiddenDownload = await clientB.storage.from("weyra-observation-uploads").download(objectPath);
  assert(Boolean(hiddenDownload.error), "Deleted observation media remained publicly readable.");
  stage("deletion_revokes_media_access_ok");
  stage("complete", { ok: true });
} finally {
  if (clientA && realtimeChannel) await clientA.removeChannel(realtimeChannel).catch(() => undefined);
  if (caseId) await admin.from("moderation_cases").delete().eq("id", caseId);
  if (reportId) await admin.from("content_reports").delete().eq("id", reportId);
  if (observationId || realtimeObservationId) {
    await admin.from("observations").delete().in("id", [observationId, realtimeObservationId].filter(Boolean));
  }
  if (objectPath) await admin.storage.from("weyra-observation-uploads").remove([objectPath]);
  if (mediaId) await admin.from("media_assets").delete().eq("id", mediaId);
  if (userA) await admin.auth.admin.deleteUser(userA.id);
  if (userB) await admin.auth.admin.deleteUser(userB.id);
  stage("cleanup_finished");
}
