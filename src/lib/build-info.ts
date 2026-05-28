const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH ? Number(process.env.SOURCE_DATE_EPOCH) * 1000 : Number.NaN;
const buildTimeMs = Number.isFinite(sourceDateEpoch) ? sourceDateEpoch : Date.now();
const configuredBuildDate = process.env.BUILD_TIME ? new Date(process.env.BUILD_TIME) : null;
const buildDate = configuredBuildDate && !Number.isNaN(configuredBuildDate.getTime()) ? configuredBuildDate : new Date(buildTimeMs);

export const BUILD_TIME = buildDate.toISOString().slice(0, 16).replace("T", " ");
