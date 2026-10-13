/** The signed-in Account's new display name; nothing else about the Account changes with it. */
export type UpdateDisplayNameInput = {
  displayName: string;
};

/** The password that proves who is asking, and the one that replaces it. */
export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

/** The address the Account moves to, and the password that proves who is asking. Nothing changes until the emailed link is confirmed. */
export type ChangeEmailInput = {
  newEmail: string;
  currentPassword: string;
};

/** The token from the email-change link. */
export type ConfirmEmailChangeInput = {
  token: string;
};

/** Whether the caller's own session belongs to the Account and was kept; every other session of the Account is gone. */
export type ConfirmEmailChangeResponse = {
  signedIn: boolean;
};
