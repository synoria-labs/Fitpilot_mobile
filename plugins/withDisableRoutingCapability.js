const {
  withInfoPlist,
} = require("expo/config-plugins");

const ROUTING_DOCUMENT_TYPE = "com.apple.maps.directionsrequest";

function withoutRoutingDocumentTypes(documentTypes) {
  if (!Array.isArray(documentTypes)) {
    return documentTypes;
  }

  const filtered = documentTypes.filter((entry) => {
    const handledTypes = Array.isArray(entry?.LSItemContentTypes)
      ? entry.LSItemContentTypes
      : [];

    return !handledTypes.includes(ROUTING_DOCUMENT_TYPE);
  });

  return filtered.length > 0 ? filtered : undefined;
}

function withDisableRoutingCapability(config) {
  return withInfoPlist(config, (mod) => {
    delete mod.modResults.MKDirectionsApplicationSupportedModes;

    mod.modResults.CFBundleDocumentTypes = withoutRoutingDocumentTypes(
      mod.modResults.CFBundleDocumentTypes,
    );

    return mod;
  });
}

module.exports = withDisableRoutingCapability;
