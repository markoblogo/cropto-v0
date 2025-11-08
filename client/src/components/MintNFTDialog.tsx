import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Coins, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const mintNFTSchema = z.object({
  toAddress: z.string()
    .min(42, "Address must be 42 characters")
    .max(42, "Address must be 42 characters")
    .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

type MintNFTFormData = z.infer<typeof mintNFTSchema>;

interface MintNFTDialogProps {
  optionId: string;
  nftStatus?: string | null;
  nftTokenId?: number | null;
  nftMintTx?: string | null;
  onMintSuccess?: () => void;
}

export function MintNFTDialog({ 
  optionId, 
  nftStatus,
  nftTokenId,
  nftMintTx,
  onMintSuccess 
}: MintNFTDialogProps) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const { toast } = useToast();

  const form = useForm<MintNFTFormData>({
    resolver: zodResolver(mintNFTSchema),
    defaultValues: {
      toAddress: "",
    },
  });

  const handleSubmit = async (data: MintNFTFormData) => {
    try {
      setIsPending(true);

      const authToken = localStorage.getItem("cropto_token");
      
      const response = await fetch("/api/onchain/mint-nft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken && { "Authorization": `Bearer ${authToken}` }),
        },
        credentials: "include",
        body: JSON.stringify({
          optionId,
          toAddress: data.toAddress,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || "Failed to mint NFT");
      }

      toast({
        title: "NFT Minted Successfully!",
        description: (
          <div className="space-y-2">
            <p>Token ID: {result.tokenId}</p>
            <a 
              href={result.explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              View on Explorer <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        ),
      });

      form.reset();
      setOpen(false);
      
      if (onMintSuccess) {
        onMintSuccess();
      }
    } catch (error: any) {
      console.error("Mint NFT error:", error);
      toast({
        variant: "destructive",
        title: "Mint Failed",
        description: error.message || "Failed to mint NFT",
      });
    } finally {
      setIsPending(false);
    }
  };

  // If already minted, show view link
  if (nftStatus === "MINTED" && nftMintTx) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1">
          <Coins className="w-3 h-3" />
          NFT #{nftTokenId}
        </Badge>
        <a
          href={`https://amoy.polygonscan.com/tx/${nftMintTx}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button
            size="sm"
            variant="ghost"
            className="gap-1 h-7 px-2"
            data-testid={`button-view-nft-${optionId}`}
          >
            <ExternalLink className="w-3 h-3" />
            View
          </Button>
        </a>
      </div>
    );
  }

  // If minting in progress
  if (nftStatus === "MINTING") {
    return (
      <Badge variant="outline" className="gap-1">
        <Coins className="w-3 h-3 animate-pulse" />
        Minting...
      </Badge>
    );
  }

  // Show mint button
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          size="sm" 
          variant="outline"
          className="gap-2"
          data-testid={`button-mint-nft-${optionId}`}
        >
          <Coins className="w-4 h-4" />
          Mint NFT
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-mint-nft">
        <DialogHeader>
          <DialogTitle>Mint Option NFT</DialogTitle>
          <DialogDescription>
            Mint this option as an ERC-721 NFT on Polygon Amoy testnet
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="toAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Recipient Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0x..."
                      {...field}
                      data-testid="input-nft-address"
                    />
                  </FormControl>
                  <FormDescription>
                    The Ethereum address that will receive the NFT
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button 
                type="submit" 
                disabled={isPending}
                data-testid="button-confirm-mint-nft"
              >
                {isPending ? "Minting..." : "Mint NFT"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
