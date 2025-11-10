import { useForm } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { toast } from "sonner";
import z from "zod";
import { getSessionOptions } from "@/api/session";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_layout/settings")({
  component: RouteComponent,
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(getSessionOptions);
  },
  pendingComponent: PendingComponent,
});

function PendingComponent() {
  return (
    <div className="mx-auto w-full max-w-4xl p-6">
      <h1 className="mb-6 font-bold text-3xl">Settings</h1>

      <Tabs defaultValue="profile" onChange={() => {}} value="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="tokens">Personal Access Tokens</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <div className="rounded-lg border p-6">
            <Skeleton className="mb-6 h-6 w-40" />

            <div className="mb-6 flex items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RouteComponent() {
  const { data: session, isLoading } = useSuspenseQuery(getSessionOptions);

  if (isLoading) {
    return <PendingComponent />;
  }

  const user = session?.user;

  return (
    <>
      <Authenticated>
        <div className="mx-auto w-full max-w-4xl p-6">
          <h1 className="mb-6 font-bold text-3xl">Settings</h1>

          <Tabs defaultValue="profile">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="tokens">Personal Access Tokens</TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <ProfileSettings
                email={user?.email ?? "NO_EMAIL"}
                name={user?.name ?? "NO_NAME"}
                username={user?.username ?? "NO_USERNAME"}
              />
            </TabsContent>

            <TabsContent value="tokens">
              <div className="rounded-lg border p-6">
                <h2 className="mb-2 font-semibold text-lg">
                  Personal Access Tokens
                </h2>
                <p className="text-muted-foreground text-sm">
                  Manage your personal access tokens for API authentication.
                </p>
                <div className="mt-4 text-muted-foreground text-sm">
                  Coming soon...
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </Authenticated>
      <Unauthenticated>
        <Navigate to="/" />
      </Unauthenticated>
      <AuthLoading>
        <PendingComponent />
      </AuthLoading>
    </>
  );
}

type ProfileSettingsProps = {
  name: string;
  email: string;
  username: string;
};

function ProfileSettings({ name, email, username }: ProfileSettingsProps) {
  const queryClient = useQueryClient();

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const result = await authClient.updateUser({
        name: data.name,
      });
      if (result.error) {
        throw new Error(result.error.message || "Failed to update profile");
      }
      await queryClient.refetchQueries({
        queryKey: getSessionOptions.queryKey,
      });
      return result.data;
    },
    onSuccess: async () => {
      toast.success("Profile updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update profile");
    },
  });

  const form = useForm({
    defaultValues: {
      name,
    },
    onSubmit: async ({ value }) => {
      await updateProfileMutation.mutateAsync(value);
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(2, "Name must be at least 2 characters"),
      }),
    },
  });

  return (
    <div className="rounded-lg border p-6">
      <h2 className="mb-6 font-semibold text-lg">Profile Information</h2>

      <div className="mb-6 flex items-center gap-4">
        <Avatar className="h-20 w-20">
          <AvatarImage
            alt={`@${username}`}
            src={`https://api.dicebear.com/9.x/notionists/svg?seed=${username}&scale=150&backgroundType=solid,gradientLinear&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`}
          />
          <AvatarFallback>
            {name
              .split(" ")
              .map((w) => w.at(0))
              .join("")}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium text-lg">{name}</p>
          <p className="text-muted-foreground text-sm">@{username}</p>
        </div>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div>
          <form.Field name="name">
            {(field) => (
              <div className="space-y-2">
                <Label htmlFor={field.name}>Name</Label>
                <Input
                  id={field.name}
                  name={field.name}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder={name}
                  value={field.state.value}
                />
                {field.state.meta.errors.map((error) => (
                  <p className="text-red-500 text-sm" key={error?.message}>
                    {error?.message}
                  </p>
                ))}
              </div>
            )}
          </form.Field>
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input disabled id="username" value={username} />
          <p className="text-muted-foreground text-xs">
            Username cannot be changed
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input disabled id="email" type="email" value={email} />
          <p className="text-muted-foreground text-xs">
            Email cannot be changed
          </p>
        </div>
        <Button loading={updateProfileMutation.isPending} type="submit">
          Save Changes
        </Button>
      </form>
    </div>
  );
}
