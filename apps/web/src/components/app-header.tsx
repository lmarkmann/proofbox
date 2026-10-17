import { useAuth } from "@workos-inc/authkit-react";
import { ChevronDownIcon, LogOutIcon, UserRoundIcon } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Theme = "light" | "dark" | "system";

function UserMenu() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  if (!user) return null;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-9 gap-2 px-1.5 sm:pr-2.5"
            aria-label="Account menu"
          />
        }
      >
        <Avatar size="sm" className="size-7">
          {user.profilePictureUrl && <AvatarImage src={user.profilePictureUrl} alt="" />}
          <AvatarFallback>
            <UserRoundIcon className="size-4" />
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-52 truncate text-sm font-normal md:inline">{user.email}</span>
        <ChevronDownIcon className="hidden size-4 text-muted-foreground md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2.5 px-1.5 py-2">
            <Avatar>
              {user.profilePictureUrl && <AvatarImage src={user.profilePictureUrl} alt="" />}
              <AvatarFallback>
                <UserRoundIcon className="size-4" />
              </AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col">
              {name && <span className="truncate text-sm font-medium text-foreground">{name}</span>}
              <span className="truncate text-xs font-normal">{user.email}</span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppHeader() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <a href="/" className="shrink-0" aria-label="ProofBox home">
          <img src="/proofbox-wordmark.svg" alt="ProofBox" className="h-7 dark:invert" />
        </a>
        <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />
        <span className="hidden text-sm text-muted-foreground sm:block">Packing station</span>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
