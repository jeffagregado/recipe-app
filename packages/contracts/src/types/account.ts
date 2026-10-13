/** The signed-in Account's new display name; nothing else about the Account changes with it. */
export type UpdateDisplayNameInput = {
  displayName: string;
};

/** The password that proves who is asking, and the one that replaces it. */
export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};
