import React from "react";
import { IdentityMatrix, ProfileSearchDropdown } from "../IdentityMatrix";

export { ProfileSearchDropdown };

export function MasonLinker({ isWayfinder = false }: { isWayfinder?: boolean }) {
  return <IdentityMatrix isWayfinder={isWayfinder} initialFilterRole="verified_masons" />;
}
export default MasonLinker;
