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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  const mintNFTSchema = z.object({
    toAddress: z
      .string()
      .min(42, t("dialog.mintNft.validation.addressLength"))
      .max(42, t("dialog.mintNft.validation.addressLength"))
      .regex(/^0x[a-fA-F0-9]{40}$/, t("dialog.mintNft.validation.addressInvalid")),
  });

  type MintNFTFormData = z.infer<typeof mintNFTSchema>;

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
        throw new Error(result.message || result.error || t("dialog.mintNft.errors.failed"));
      }

      toast({
        title: t("dialog.mintNft.success"),
        description: (
          <div className="space-y-2">
            <p>{t("dialog.mintNft.tokenId")} {result.tokenId}</p>
            <a 
              href={result.explorerUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              {t("dialog.mintNft.viewExplorer")} <ExternalLink className="w-3 h-3" />
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
        title: t("dialog.mintNft.errorTitle"),
        description: error.message || t("dialog.mintNft.errors.failed"),
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
          {t("dialog.mintNft.nftLabel", { id: nftTokenId })}
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
            {t("dialog.mintNft.view")}
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
        {t("dialog.mintNft.buttonPending")}
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
          {t("dialog.mintNft.button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-mint-nft">
        <DialogHeader>
          <DialogTitle>{t("dialog.mintNft.title")}</DialogTitle>
          <DialogDescription>
            {t("dialog.mintNft.subtitle")}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="toAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dialog.mintNft.recipientLabel")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("dialog.mintNft.recipientPlaceholder")}
                      {...field}
                      data-testid="input-nft-address"
                    />
                  </FormControl>
                  <FormDescription>
                    {t("dialog.mintNft.recipientDesc")}
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
                {isPending ? t("dialog.mintNft.buttonPending") : t("dialog.mintNft.button")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
