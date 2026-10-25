import React from "react";
import SAMalwareOversight from "./SAMalwareOversight";

export default function SAOversightReports(props: any) {
  return <SAMalwareOversight {...props} initialFilter="manifests" />;
}
