import { DirectiveSlug } from "../directivesSync";
import type { DirectiveBuilderSchema } from "./types";
import { defaultT, interpolateDynamicText } from "./types";
import { getElevatedRolesCards } from "./seeds/elevatedRolesSeed";
import { buildCitizenGuideSchema } from "./seeds/citizenGuideSeed";
import { buildPhaseRoadmapSchema } from "./seeds/phaseRoadmapSeed";
import { buildForkingGuideSchema } from "./seeds/forkingGuideSeed";
import { buildMasterArchitectureSchema } from "./seeds/masterArchitectureSeed";
import { buildMasterProtocolsSchema } from "./seeds/masterProtocolsSeed";

export function getDefaultDirectiveBuilderSchema(
  slug: DirectiveSlug,
  t: (key: string, fallback: string) => string = defaultT
): DirectiveBuilderSchema {
  const g = (txt: string) => interpolateDynamicText(t, txt);
  const elevatedRolesCards = getElevatedRolesCards(t);

  if (slug === "citizen_guide") {
    return buildCitizenGuideSchema(t, g, elevatedRolesCards);
  }
  if (slug === "phase_roadmap") {
    return buildPhaseRoadmapSchema(t, g, elevatedRolesCards);
  }
  if (slug === "forking_guide") {
    return buildForkingGuideSchema(t, g, elevatedRolesCards);
  }
  if (slug === "master_architecture") {
    return buildMasterArchitectureSchema(t, g, elevatedRolesCards);
  }
  return buildMasterProtocolsSchema(t, g, elevatedRolesCards);
}
