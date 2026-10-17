import { notionists } from "@dicebear/collection";
import { createAvatar } from "@dicebear/core";
import { type User, useAuth } from "@workos-inc/authkit-react";
import { LogOutIcon } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { ThemeSwitch } from "@/components/theme-switch";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type Account = Pick<User, "id" | "email" | "firstName" | "lastName" | "profilePictureUrl">;

const AVATAR_BACKGROUNDS = ["f4d9b8", "c9e4d4", "d6dcf5", "f5d0d6", "efe3b5"];

/** The WorkOS picture when there is one, else a DiceBear face drawn in the browser from the user id. */
function AccountAvatar({ user, className }: { user: Account; className?: string }) {
  const face = useMemo(
    () =>
      createAvatar(notionists, { seed: user.id, backgroundColor: AVATAR_BACKGROUNDS }).toDataUri(),
    [user.id],
  );
  return (
    <Avatar className={className}>
      <AvatarImage src={user.profilePictureUrl ?? face} alt="" />
    </Avatar>
  );
}

export function UserMenu({ user, onSignOut }: { user: Account; onSignOut: () => void }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu" />
        }
      >
        <AccountAvatar user={user} className="size-8" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 px-1.5 py-2">
            <AccountAvatar user={user} className="size-9" />
            <span className="flex min-w-0 flex-col">
              {name && <span className="truncate text-sm font-medium text-foreground">{name}</span>}
              <span className="truncate text-xs font-normal">{user.email}</span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader({ children }: { children?: ReactNode }) {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 xl:group-has-data-[slot=inspector]/station:max-w-none">
        <a href="/" className="shrink-0" aria-label="ProofBox home">
          <img src="/proofbox-wordmark.svg" alt="ProofBox" className="h-7 dark:invert" />
        </a>
        <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
        <span className="hidden text-sm text-muted-foreground sm:block">Packing station</span>
        <div className="ml-auto flex items-center gap-3">
          {children}
          <ThemeSwitch />
          {user && <UserMenu user={user} onSignOut={() => signOut()} />}
        </div>
      </div>
    </header>
  );
}
