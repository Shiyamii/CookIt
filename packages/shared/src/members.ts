import { z } from 'zod';
import { usernameSchema } from './accounts';

// Members and the instance's settings. The members list shows the accounts that chose to appear
// in it (an admin may change it too); any member's page (name, picture, public recipes) can be
// opened from their recipes. Both are for signed-in members only.

/** The settings of the instance, changed by an admin. */
export const instanceSettingsSchema = z
  .object({
    /** Public recipes and the gallery are readable without an account (off: members only). */
    publicGallery: z.boolean(),
  })
  .strict();
export type InstanceSettings = z.infer<typeof instanceSettingsSchema>;

/** Appear in the members list (the user's own choice, or an admin's). */
export const memberListedInputSchema = z.object({ listed: z.boolean() }).strict();

/** A username in a URL (`/members/:username`): the shape usernames are created with. */
export const memberUsernameSchema = usernameSchema;

/** A member in the members list. */
export type MemberSummary = {
  username: string;
  name: string;
  /** URL of their profile picture. */
  image: string | null;
  publicRecipes: number;
};

/** A member's page. */
export type MemberProfile = MemberSummary & {
  /** They appear in the members list: only on the user's own page. */
  listed?: boolean;
};
