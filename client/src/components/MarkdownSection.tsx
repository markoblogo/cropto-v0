import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownSectionProps {
  src: string;
  title?: string;
  className?: string;
}

export function MarkdownSection({ src, title, className }: MarkdownSectionProps) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMarkdown = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(src);
        if (response.ok) {
          const text = await response.text();
          setContent(text);
        } else {
          setError(`Failed to load ${src}`);
        }
      } catch (err) {
        console.error("Error loading markdown:", err);
        setError(`Error loading ${src}`);
      } finally {
        setLoading(false);
      }
    };

    loadMarkdown();
  }, [src]);

  if (loading) {
    return (
      <div className={cn("py-8 text-center text-muted-foreground", className)}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("py-8 text-center text-destructive", className)}>
        {error}
      </div>
    );
  }

  return (
    <div className={cn("prose prose-neutral dark:prose-invert max-w-none", className)}>
      {title && <h2 className="text-2xl font-bold mb-4">{title}</h2>}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}






