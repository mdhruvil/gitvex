import { useQuery } from "@tanstack/react-query";
import { GitBranchIcon } from "lucide-react";
import { getBranchesQueryOptions } from "@/api/branches";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Skeleton } from "./ui/skeleton";

type BranchSelectorProps = {
  owner: string;
  repo: string;
  selectedBranch?: string;
  onBranchChange: (branch: string) => void;
};

export function BranchSelector({
  owner,
  repo,
  selectedBranch,
  onBranchChange,
}: BranchSelectorProps) {
  const { data, isLoading } = useQuery(
    getBranchesQueryOptions({
      owner,
      repo,
    })
  );

  const branches = data?.branches;
  const currentBranch = data?.currentBranch;

  if (isLoading) {
    return <Skeleton className="h-9 w-[180px]" />;
  }

  return (
    <Select
      onValueChange={onBranchChange}
      value={selectedBranch ?? currentBranch ?? "HEAD"}
    >
      <SelectTrigger className="w-[180px]">
        <div className="flex items-center gap-2">
          <GitBranchIcon className="size-4" />
          <SelectValue />
        </div>
      </SelectTrigger>
      <SelectContent>
        {branches?.map((branch) => (
          <SelectItem key={branch} value={branch}>
            {branch}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
