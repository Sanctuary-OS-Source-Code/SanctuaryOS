import React, { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import {
  SidePanel,
  SidePanelHeroCard,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
} from "../shared";
import { UniversalGroup, UniversalInput, UniversalTextArea } from "../components/layouts/ElevatedHubLayout";
import { VAULT_CHIP_CLASS } from "../Cards";

export function MasonSettingsSidePanel({
  isOpen,
  onClose,
  profile,
  onUpdate,
}: {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  onUpdate: (p: any) => void;
}) {
  const { t } = useLexicon();
  const [formData, setFormData] = useState({
    name: profile.name || "",
    bio: profile.bio || "",
    avatar_url: profile.avatar_url || "",
    patreon_url: profile.patreon_url || "",
    website_url: profile.website_url || "",
    discord_url: profile.discord_url || "",
    donation_url: profile.donation_url || "",
    payment_processor: profile.payment_processor || "Patreon",
    patreon_campaign_id: profile.patreon_campaign_id || "",
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: profile.name || "",
        bio: profile.bio || "",
        avatar_url: profile.avatar_url || "",
        patreon_url: profile.patreon_url || "",
        website_url: profile.website_url || "",
        discord_url: profile.discord_url || "",
        donation_url: profile.donation_url || "",
        payment_processor: profile.payment_processor || "Patreon",
        patreon_campaign_id: profile.patreon_campaign_id || "",
      });
    }
  }, [isOpen, profile]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const state = useStore.getState();
      const token = state.session?.access_token;

      if (token) {
        const { data, error } = await supabase.rpc("secure_update_mason_profile", {
          p_token: token,
          p_mason_id: profile.id,
          p_payload: formData,
        });

        if (error) throw error;

        onUpdate(data);
        useStore.getState().pushStatus(t("alert_saved", "Saved successfully"), "success");
        onClose();
      } else {
        const { data, error } = await supabase
          .from("masons")
          .update(formData)
          .eq("id", profile.id)
          .select()
          .single();
        if (error) throw error;
        onUpdate(data);
        useStore.getState().pushStatus(t("alert_saved", "Saved successfully"), "success");
        onClose();
      }
    } catch (err: any) {
      useStore
        .getState()
        .pushStatus(t("alert_error", `Failed to save: ${err.message}`), "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("masonhub_settings_title", "{Mason} Settings")}
      subtitle={t("creator_identity", "Creator Identity")}
      icon={t("icon_settings", "settings")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={isSaving ? t("icon_sync", "sync") : t("icon_save", "save")}
            tooltip={
              isSaving
                ? t("saving_settings", "Saving...")
                : t("save_configuration", "Save Configuration")
            }
            variant="accent"
            disabled={isSaving}
            className={isSaving ? "animate-pulse" : ""}
            onClick={handleSave}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_badge", "badge")}
          overline={t("creator_identity", "Creator Identity")}
          title={formData.name || t("masonhub_settings_title", "{Mason} Settings")}
          description={t("supporter_liability_notice", "Non-Custodial Notice: Partner Communities and {Masons} run their own payment processors and receive 100% of your contribution. Sanctuary OS takes a 0% cut, never touches the funds, and does not process refunds or chargebacks.")}
          badge={t("supporter_zero_fee_badge", "0% PLATFORM FEE • NON-CUSTODIAL")}
          badgeIcon={t("icon_verified", "verified")}
          variant="accent"
        />

        <UniversalGroup
          title={t("creator_identity", "Creator Identity")}
          icon={t("icon_badge", "badge")}
        >
          <UniversalInput
            label={t("public_name", "Public Name")}
            value={formData.name}
            onChange={(val) => setFormData({ ...formData, name: val })}
          />
          <UniversalInput
            label={t("avatar_url", "Avatar URL")}
            value={formData.avatar_url}
            onChange={(val) => setFormData({ ...formData, avatar_url: val })}
          />
          <UniversalTextArea
            label={t("biography", "Biography")}
            value={formData.bio}
            onChange={(val) => setFormData({ ...formData, bio: val })}
            rows={4}
          />
        </UniversalGroup>

        <UniversalGroup
          title={t("social_links", "External Links")}
          icon={t("icon_link", "link")}
        >
          <UniversalInput
            label={t("patreon_url", "Patreon URL")}
            value={formData.patreon_url}
            onChange={(val) => setFormData({ ...formData, patreon_url: val })}
          />
          <UniversalInput
            label={t("personal_website", "Personal Website")}
            value={formData.website_url}
            onChange={(val) => setFormData({ ...formData, website_url: val })}
          />
          <UniversalInput
            label={t("discord_url", "Discord URL")}
            value={formData.discord_url}
            onChange={(val) => setFormData({ ...formData, discord_url: val })}
          />
        </UniversalGroup>

        <UniversalGroup
          title={t(
            "supporter_mason_settings_group",
            "Non-Custodial Supporter & API Bridge (0% Fee)"
          )}
          icon={t("icon_volunteer_activism", "volunteer_activism")}
        >
          <div className="glass-surface rounded-xl px-4 py-3 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`${VAULT_CHIP_CLASS} w-fit`}
                style={{
                  color: "var(--accent)",
                  borderColor: "color-mix(in srgb, var(--accent) 35%, var(--border))",
                }}
              >
                <span className="material-symbols-rounded !text-[12px] shrink-0">
                  {t("icon_verified", "verified")}
                </span>
                {t("supporter_zero_fee_badge", "0% PLATFORM FEE • NON-CUSTODIAL")}
              </span>
            </div>
            <p className="text-[11px] font-medium text-[var(--subtext)] leading-relaxed m-0">
              {t("supporter_liability_notice", "Non-Custodial Notice: Partner Communities and {Masons} run their own payment processors and receive 100% of your contribution. Sanctuary OS takes a 0% cut, never touches the funds, and does not process refunds or chargebacks.")}
            </p>
          </div>
          <UniversalInput
            label={t("supporter_mason_processor_label", "Primary Payment Processor")}
            value={formData.payment_processor}
            onChange={(val) => setFormData({ ...formData, payment_processor: val })}
          />
          <UniversalInput
            label={t(
              "supporter_mason_donation_url",
              "Direct Tip / Checkout URL (Ko-fi, Stripe, PayPal)"
            )}
            value={formData.donation_url}
            onChange={(val) => setFormData({ ...formData, donation_url: val })}
          />
          <UniversalInput
            label={t(
              "supporter_mason_patreon_campaign",
              "Patreon Campaign ID (For Local API Bridge)"
            )}
            value={formData.patreon_campaign_id}
            onChange={(val) =>
              setFormData({ ...formData, patreon_campaign_id: val })
            }
          />
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
