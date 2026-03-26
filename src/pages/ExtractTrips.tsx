import { useState, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
// TripsTable no longer used — replaced with inline editable cards
import { useInsertTrips } from "@/hooks/useTrips";
import { useDrivers, useInsertDriver } from "@/hooks/useDrivers";
import {
  Upload,
  ScanLine,
  CheckCircle,
  AlertCircle,
  XCircle,
  Clock,
  RotateCcw,
  Trash2,
  Save,
  Loader2,
  ImageIcon,
  Plus,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useExtractionSettings } from "@/hooks/useExtractionSettings";
import { Badge } from "@/components/ui/badge";
import { getDriverColor } from "@/lib/driverColors";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

type ExtractedTrip = {
  member_name: string;
  trip_number: string;
  pickup_time: string;
  dropoff_time: string;
  mileage: number | null;
  pickup_address?: string;
  dropoff_address?: string;
  trip_id_reference?: string;
};

type ReviewTrip = ExtractedTrip & {
  review_reason: string;
};

type SkippedTrip = {
  member_name: string;
  trip_number: string;
  reason: string;
};

type ExtractionResult = {
  driver_name: string;
  date: string;
  trips: ExtractedTrip[];
  review?: ReviewTrip[];
  skipped?: SkippedTrip[];
};

type ImageStatus = "pending" | "extracting" | "success" | "error";

type ReviewItemStatus = "pending" | "accepted" | "rejected";

type BatchImage = {
  id: string;
  file: File;
  preview: string;
  status: ImageStatus;
  result: ExtractionResult | null;
  error: string | null;
  saved: boolean;
  rejected: boolean;
  tripEdits: Record<number, Partial<ExtractedTrip>>;
  reviewEdits: Record<number, Partial<ExtractedTrip>>;
  reviewStatuses: Record<number, ReviewItemStatus>;
};

export default function ExtractTrips() {
  const [dragActive, setDragActive] = useState(false);
  const [images, setImages] = useState<BatchImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const insertTrips = useInsertTrips();
  const { settings } = useExtractionSettings();
  const processingRef = useRef(false);
  const { data: drivers = [] } = useDrivers();
  const insertDriver = useInsertDriver();
  const [driverNameOverride, setDriverNameOverride] = useState<Record<string, string>>({});
  const [driverPopoverOpen, setDriverPopoverOpen] = useState<Record<string, boolean>>({});

  const allDriverNames = drivers.map((d) => d.name);

  const getEffectiveDriverName = (img: BatchImage) =>
    driverNameOverride[img.id] ?? img.result?.driver_name ?? "";

  const addFiles = useCallback((files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      toast.error("Please upload image files");
      return;
    }

    const newImages: BatchImage[] = [];
    let loaded = 0;

    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        newImages.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          preview: e.target?.result as string,
          status: "pending",
          result: null,
          error: null,
          saved: false,
          rejected: false,
          tripEdits: {},
          reviewEdits: {},
          reviewStatuses: {},
        });
        loaded++;
        if (loaded === imageFiles.length) {
          setImages((prev) => [...prev, ...newImages]);
          toast.success(`${imageFiles.length} image(s) added`);
        }
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const extractSingle = async (image: BatchImage): Promise<BatchImage> => {
    try {
      const { data, error } = await supabase.functions.invoke("extract-trips", {
        body: {
          imageBase64: image.preview,
          provider: settings.provider,
          cloudProvider: settings.cloudProvider,
          cloudModel: settings.cloudModel,
          apiKey: settings.apiKeys[settings.cloudProvider],
          ollamaUrl: settings.ollamaUrl,
          ollamaModel: settings.ollamaModel,
        },
      });

      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);

      const result = data as ExtractionResult;
      const reviewTrips = result.review ?? [];
      const tripEdits: Record<number, Partial<ExtractedTrip>> = {};
      result.trips.forEach((t, i) => {
        tripEdits[i] = { ...t };
      });
      const reviewEditEntries: Record<number, Partial<ExtractedTrip>> = {};
      const statuses: Record<number, ReviewItemStatus> = {};
      reviewTrips.forEach((t: ReviewTrip, i: number) => {
        reviewEditEntries[i] = { ...t };
        statuses[i] = "pending";
      });

      return { ...image, status: "success", result, error: null, tripEdits, reviewEdits: reviewEditEntries, reviewStatuses: statuses };
    } catch (err: any) {
      console.error("Extraction error:", err);
      return { ...image, status: "error", error: err.message || "Extraction failed", result: null };
    }
  };

  const processAll = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);

    const pending = images.filter((img) => img.status === "pending" || img.status === "error");
    for (const img of pending) {
      if (!processingRef.current) break;

      // Mark as extracting
      setImages((prev) =>
        prev.map((p) => (p.id === img.id ? { ...p, status: "extracting" as ImageStatus } : p))
      );

      const updated = await extractSingle(img);

      setImages((prev) => prev.map((p) => (p.id === img.id ? updated : p)));

      // Small delay between extractions to avoid rate limits
      if (processingRef.current) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    processingRef.current = false;
    setIsProcessing(false);
    toast.success("Batch extraction complete");
  };

  const retrySingle = async (id: string) => {
    const img = images.find((i) => i.id === id);
    if (!img) return;

    setImages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "extracting" as ImageStatus, error: null } : p))
    );

    const updated = await extractSingle(img);
    setImages((prev) => prev.map((p) => (p.id === id ? updated : p)));
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((p) => p.id !== id));
  };

  const updateTripEdit = (imageId: string, index: number, field: keyof ExtractedTrip, value: string | number | null) => {
    setImages((prev) =>
      prev.map((p) =>
        p.id === imageId
          ? { ...p, tripEdits: { ...p.tripEdits, [index]: { ...p.tripEdits[index], [field]: value } } }
          : p
      )
    );
  };

  const removeTripFromResult = (imageId: string, tripIndex: number) => {
    setImages((prev) =>
      prev.map((p) => {
        if (p.id !== imageId || !p.result) return p;
        const newTrips = p.result.trips.filter((_, i) => i !== tripIndex);
        // Re-index tripEdits
        const newEdits: Record<number, Partial<ExtractedTrip>> = {};
        let newIdx = 0;
        p.result.trips.forEach((_, i) => {
          if (i !== tripIndex) {
            newEdits[newIdx] = p.tripEdits[i] || {};
            newIdx++;
          }
        });
        return { ...p, result: { ...p.result, trips: newTrips }, tripEdits: newEdits };
      })
    );
    toast.info("Trip removed");
  };

  const addTripToResult = (imageId: string) => {
    setImages((prev) =>
      prev.map((p) => {
        if (p.id !== imageId || !p.result) return p;
        const blank: ExtractedTrip = {
          member_name: "",
          trip_number: "",
          pickup_time: "",
          dropoff_time: "",
          mileage: null,
          pickup_address: "",
          dropoff_address: "",
        };
        const newTrips = [...p.result.trips, blank];
        const newEdits = { ...p.tripEdits, [newTrips.length - 1]: { ...blank } };
        return { ...p, result: { ...p.result, trips: newTrips }, tripEdits: newEdits };
      })
    );
  };

  const saveResult = (id: string) => {
    const img = images.find((i) => i.id === id);
    if (!img?.result) return;

    const rows = img.result.trips.map((t, i) => {
      const edits = img.tripEdits[i] || {};
      return {
        member_name: edits.member_name ?? t.member_name,
        trip_number: edits.trip_number ?? t.trip_number,
        pickup_time: edits.pickup_time ?? t.pickup_time,
        dropoff_time: edits.dropoff_time ?? t.dropoff_time,
        mileage: edits.mileage !== undefined ? edits.mileage : t.mileage,
        date: img.result!.date,
        driver_name: getEffectiveDriverName(img),
        pickup_address: edits.pickup_address ?? t.pickup_address ?? null,
        dropoff_address: edits.dropoff_address ?? t.dropoff_address ?? null,
        source: "ocr" as const,
        status: "COMPLETED" as const,
        trip_id_reference: edits.trip_id_reference ?? t.trip_id_reference ?? null,
      };
    });

    if (rows.length === 0) {
      toast.error("No valid trips to save");
      return;
    }

    insertTrips.mutate(rows, {
      onSuccess: () => {
        setImages((prev) => prev.map((p) => (p.id === id ? { ...p, saved: true } : p)));
      },
    });
  };

  const acceptSingleReview = (imageId: string, index: number) => {
    const img = images.find((i) => i.id === imageId);
    if (!img?.result?.review) return;
    const t = img.result.review[index];
    const edits = img.reviewEdits[index] || {};
    if (!edits.pickup_time || !edits.dropoff_time) {
      toast.error("Fill in pickup and dropoff times first");
      return;
    }
    const row = {
      member_name: edits.member_name ?? t.member_name,
      trip_number: edits.trip_number ?? t.trip_number,
      pickup_time: edits.pickup_time,
      dropoff_time: edits.dropoff_time,
      mileage: edits.mileage !== undefined ? edits.mileage : t.mileage,
      date: img.result!.date,
      driver_name: getEffectiveDriverName(img),
      pickup_address: edits.pickup_address ?? t.pickup_address ?? null,
      dropoff_address: edits.dropoff_address ?? t.dropoff_address ?? null,
      source: "ocr" as const,
      status: "COMPLETED" as const,
      trip_id_reference: edits.trip_id_reference ?? t.trip_id_reference ?? null,
    };
    insertTrips.mutate([row], {
      onSuccess: () => {
        setImages((prev) =>
          prev.map((p) =>
            p.id === imageId
              ? { ...p, reviewStatuses: { ...p.reviewStatuses, [index]: "accepted" as ReviewItemStatus } }
              : p
          )
        );
        toast.success(`Trip ${t.trip_number} accepted`);
      },
    });
  };

  const rejectSingleReview = (imageId: string, index: number) => {
    setImages((prev) =>
      prev.map((p) =>
        p.id === imageId
          ? { ...p, reviewStatuses: { ...p.reviewStatuses, [index]: "rejected" as ReviewItemStatus } }
          : p
      )
    );
    toast.info("Trip rejected");
  };

  const acceptAllReview = (imageId: string) => {
    const img = images.find((i) => i.id === imageId);
    if (!img?.result?.review) return;

    const pendingIndices = img.result.review
      .map((_, i) => i)
      .filter((i) => (img.reviewStatuses[i] ?? "pending") === "pending");

    const rows = pendingIndices
      .map((i) => {
        const t = img.result!.review![i];
        const edits = img.reviewEdits[i] || {};
        if (!edits.pickup_time || !edits.dropoff_time) return null;
        return {
          member_name: edits.member_name ?? t.member_name,
          trip_number: edits.trip_number ?? t.trip_number,
          pickup_time: edits.pickup_time,
          dropoff_time: edits.dropoff_time,
          mileage: edits.mileage !== undefined ? edits.mileage : t.mileage,
          date: img.result!.date,
          driver_name: getEffectiveDriverName(img),
          pickup_address: edits.pickup_address ?? t.pickup_address ?? null,
          dropoff_address: edits.dropoff_address ?? t.dropoff_address ?? null,
          source: "ocr" as const,
          status: "COMPLETED" as const,
          trip_id_reference: edits.trip_id_reference ?? t.trip_id_reference ?? null,
        };
      })
      .filter(Boolean) as any[];

    if (rows.length === 0) {
      toast.error("Fill in all missing times before accepting");
      return;
    }

    insertTrips.mutate(rows, {
      onSuccess: () => {
        const newStatuses = { ...img.reviewStatuses };
        pendingIndices.forEach((i) => {
          const edits = img.reviewEdits[i];
          if (edits?.pickup_time && edits?.dropoff_time) {
            newStatuses[i] = "accepted";
          }
        });
        setImages((prev) =>
          prev.map((p) => (p.id === imageId ? { ...p, reviewStatuses: newStatuses } : p))
        );
        toast.success(`${rows.length} review trip(s) accepted`);
      },
    });
  };

  const rejectAllReview = (imageId: string) => {
    const img = images.find((i) => i.id === imageId);
    if (!img?.result?.review) return;
    const newStatuses = { ...img.reviewStatuses };
    img.result.review.forEach((_, i) => {
      if ((newStatuses[i] ?? "pending") === "pending") {
        newStatuses[i] = "rejected";
      }
    });
    setImages((prev) =>
      prev.map((p) => (p.id === imageId ? { ...p, reviewStatuses: newStatuses } : p))
    );
    toast.info("All review trips rejected");
  };

  const rejectResult = (id: string) => {
    setImages((prev) => prev.map((p) => (p.id === id ? { ...p, rejected: true } : p)));
  };

  const updateReviewEdit = (imageId: string, index: number, field: keyof ExtractedTrip, value: string | number | null) => {
    setImages((prev) =>
      prev.map((p) =>
        p.id === imageId
          ? {
              ...p,
              reviewEdits: {
                ...p.reviewEdits,
                [index]: { ...p.reviewEdits[index], [field]: value },
              },
            }
          : p
      )
    );
  };

  const pendingCount = images.filter((i) => i.status === "pending").length;
  const errorCount = images.filter((i) => i.status === "error").length;
  const successCount = images.filter((i) => i.status === "success").length;
  const unsavedCount = images.filter((i) => i.status === "success" && !i.saved && !i.rejected).length;

  const statusIcon = (status: ImageStatus) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4 text-muted-foreground" />;
      case "extracting": return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case "success": return <CheckCircle className="h-4 w-4 text-success" />;
      case "error": return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const statusBadge = (img: BatchImage) => {
    if (img.saved) return <Badge variant="outline" className="text-success border-success/30">Saved</Badge>;
    if (img.rejected) return <Badge variant="outline" className="text-muted-foreground">Rejected</Badge>;
    switch (img.status) {
      case "pending": return <Badge variant="secondary">Pending</Badge>;
      case "extracting": return <Badge variant="secondary" className="animate-pulse">Extracting...</Badge>;
      case "success": return <Badge variant="outline" className="text-success border-success/30">Ready</Badge>;
      case "error": return <Badge variant="destructive">Failed</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Extract Trips from Screenshots</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload multiple driver screenshots — AI extracts trip data sequentially
          </p>
        </div>

        {/* Upload Zone */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div
            className={`upload-zone ${dragActive ? "active" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = "image/*";
              input.multiple = true;
              input.onchange = (e) => {
                const files = (e.target as HTMLInputElement).files;
                if (files && files.length > 0) addFiles(files);
              };
              input.click();
            }}
          >
            <div className="space-y-3">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop screenshots or <span className="text-primary font-medium">browse</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Select multiple files at once · Supports PNG, JPG, WEBP
              </p>
            </div>
          </div>
        </motion.div>

        {/* Batch Controls */}
        {images.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium">{images.length} image(s)</span>
              {pendingCount > 0 && <Badge variant="secondary">{pendingCount} pending</Badge>}
              {successCount > 0 && <Badge variant="outline" className="text-success border-success/30">{successCount} done</Badge>}
              {errorCount > 0 && <Badge variant="destructive">{errorCount} failed</Badge>}
              {unsavedCount > 0 && <Badge variant="outline" className="text-warning border-warning/30">{unsavedCount} unsaved</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={processAll}
                disabled={isProcessing || (pendingCount === 0 && errorCount === 0)}
              >
                <ScanLine className="h-4 w-4 mr-2" />
                {isProcessing ? "Processing..." : `Extract All (${pendingCount + errorCount})`}
              </Button>
              {unsavedCount > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const saveable = images.filter((i) => i.status === "success" && !i.saved && !i.rejected);
                    saveable.forEach((img) => saveResult(img.id));
                    toast.success(`Saving ${saveable.length} result(s)...`);
                  }}
                  disabled={insertTrips.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save All ({unsavedCount})
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => { processingRef.current = false; setIsProcessing(false); }}
                disabled={!isProcessing}
              >
                Stop
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setImages([])}
                disabled={isProcessing}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            </div>
          </motion.div>
        )}

        {/* Image Cards */}
        <div className="space-y-4">
          <AnimatePresence>
            {images.map((img) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`bg-card border rounded-xl overflow-hidden ${
                  img.saved ? "border-success/30 opacity-70" :
                  img.rejected ? "border-muted opacity-50" :
                  img.status === "error" ? "border-destructive/30" :
                  "border-border"
                }`}
              >
                {/* Image Header */}
                <div className="flex items-center gap-3 p-4 border-b border-border">
                  <div className="h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                    <img src={img.preview} alt={img.file.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{img.file.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {statusIcon(img.status)}
                      {img.result ? (
                        <div className="flex items-center gap-2">
                          {(() => {
                            const dName = getEffectiveDriverName(img);
                            const color = getDriverColor(dName, allDriverNames);
                            return (
                              <Popover
                                open={driverPopoverOpen[img.id] ?? false}
                                onOpenChange={(open) => setDriverPopoverOpen((prev) => ({ ...prev, [img.id]: open }))}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                                    style={{ backgroundColor: color.light, color: color.text }}
                                  >
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.bg }} />
                                    {dName || "Set Driver"}
                                    <ChevronsUpDown className="h-3 w-3 opacity-50" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-56 p-0" align="start">
                                  <Command>
                                    <CommandInput placeholder="Search or type driver..." />
                                    <CommandList>
                                      <CommandEmpty>
                                       <button
                                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
                                          onClick={() => {
                                            const input = document.querySelector<HTMLInputElement>(`[cmdk-input]`);
                                            const val = input?.value?.trim();
                                            if (val) {
                                              setDriverNameOverride((prev) => ({ ...prev, [img.id]: val }));
                                              setDriverPopoverOpen((prev) => ({ ...prev, [img.id]: false }));
                                              // Auto-create driver if not exists
                                              if (!drivers.some((d) => d.name.toLowerCase() === val.toLowerCase())) {
                                                insertDriver.mutate({ name: val });
                                              }
                                            }
                                          }}
                                        >
                                          Use &amp; create "{(() => {
                                            const input = document.querySelector<HTMLInputElement>(`[cmdk-input]`);
                                            return input?.value?.trim() || "…";
                                          })()}"
                                        </button>
                                      </CommandEmpty>
                                      <CommandGroup>
                                        {drivers.map((d) => {
                                          const dc = getDriverColor(d.name, allDriverNames);
                                          return (
                                            <CommandItem
                                              key={d.id}
                                              value={d.name}
                                              onSelect={() => {
                                                setDriverNameOverride((prev) => ({ ...prev, [img.id]: d.name }));
                                                setDriverPopoverOpen((prev) => ({ ...prev, [img.id]: false }));
                                              }}
                                            >
                                              <span className="h-2 w-2 rounded-full mr-2" style={{ backgroundColor: dc.bg }} />
                                              {d.name}
                                              {dName === d.name && <Check className="ml-auto h-3 w-3" />}
                                            </CommandItem>
                                          );
                                        })}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            );
                          })()}
                          <span className="text-xs text-muted-foreground">· {img.result.date} · {img.result.trips.length} trips</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {img.error || "Waiting..."}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(img)}
                    {img.status === "error" && (
                      <Button size="sm" variant="outline" onClick={() => retrySingle(img.id)}>
                        <RotateCcw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}
                    {img.status === "success" && !img.saved && !img.rejected && (
                      <>
                        <Button size="sm" onClick={() => saveResult(img.id)} disabled={insertTrips.isPending}>
                          <Save className="h-3 w-3 mr-1" />
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => rejectResult(img.id)}>
                          <XCircle className="h-3 w-3 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {(img.status === "pending" || img.saved || img.rejected) && (
                      <Button size="icon" variant="ghost" onClick={() => removeImage(img.id)} className="h-7 w-7">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded Result Details */}
                {img.status === "success" && !img.saved && !img.rejected && img.result && (
                  <div className="p-4 space-y-4">
                    {/* Valid Trips — Editable Cards */}
                    {img.result.trips.length > 0 && (
                      <div className="border border-border rounded-lg overflow-hidden">
                        <div className="px-4 py-3 border-b border-border bg-muted/30">
                          <h4 className="font-semibold text-sm">Valid Trips ({img.result.trips.length})</h4>
                        </div>
                        <div className="divide-y divide-border">
                          {img.result.trips.map((t, i) => {
                            const edits = img.tripEdits[i] || {};
                            return (
                              <div key={i} className="p-3 space-y-2 hover:bg-muted/20 transition-colors">
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Member</label>
                                    <Input
                                      value={edits.member_name ?? t.member_name}
                                      onChange={(e) => updateTripEdit(img.id, i, "member_name", e.target.value)}
                                      className="h-7 text-xs capitalize"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Trip #</label>
                                    <Input
                                      value={edits.trip_number ?? t.trip_number}
                                      onChange={(e) => updateTripEdit(img.id, i, "trip_number", e.target.value)}
                                      className="h-7 text-xs w-16"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">PU Time</label>
                                    <Input
                                      type="time"
                                      value={edits.pickup_time ?? t.pickup_time}
                                      onChange={(e) => updateTripEdit(img.id, i, "pickup_time", e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">DO Time</label>
                                    <Input
                                      type="time"
                                      value={edits.dropoff_time ?? t.dropoff_time}
                                      onChange={(e) => updateTripEdit(img.id, i, "dropoff_time", e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Miles</label>
                                    <Input
                                      type="number"
                                      value={edits.mileage !== undefined ? (edits.mileage ?? "") : (t.mileage ?? "")}
                                      onChange={(e) => updateTripEdit(img.id, i, "mileage", e.target.value ? Number(e.target.value) : null)}
                                      className="h-7 text-xs w-20"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">PU Address</label>
                                    <Input
                                      value={edits.pickup_address ?? t.pickup_address ?? ""}
                                      onChange={(e) => updateTripEdit(img.id, i, "pickup_address", e.target.value)}
                                      className="h-7 text-xs capitalize"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">DO Address</label>
                                    <Input
                                      value={edits.dropoff_address ?? t.dropoff_address ?? ""}
                                      onChange={(e) => updateTripEdit(img.id, i, "dropoff_address", e.target.value)}
                                      className="h-7 text-xs capitalize"
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => removeTripFromResult(img.id, i)}
                                    >
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );

                          })}
                        </div>
                        <div className="px-4 py-2 border-t border-border">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => addTripToResult(img.id)}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Add Trip
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Review Trips */}
                    {(img.result.review ?? []).length > 0 && (
                      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <h4 className="font-semibold text-sm flex items-center gap-2">
                            <Clock className="h-4 w-4 text-warning" />
                            Needs Review ({img.result.review!.filter((_, i) => (img.reviewStatuses[i] ?? "pending") === "pending").length} pending)
                          </h4>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => acceptAllReview(img.id)}
                              disabled={insertTrips.isPending || !img.result!.review!.some((_, i) => (img.reviewStatuses[i] ?? "pending") === "pending")}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Accept All
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => rejectAllReview(img.id)}
                              disabled={!img.result!.review!.some((_, i) => (img.reviewStatuses[i] ?? "pending") === "pending")}
                            >
                              <XCircle className="h-3 w-3 mr-1" />
                              Reject All
                            </Button>
                          </div>
                        </div>
                        {img.result.review!.map((t, i) => {
                          const status = img.reviewStatuses[i] ?? "pending";
                          const edits = img.reviewEdits[i] || {};
                          return (
                            <div
                              key={i}
                              className={`bg-card border rounded-lg p-3 space-y-2 transition-opacity ${
                                status === "accepted" ? "border-success/30 opacity-60" :
                                status === "rejected" ? "border-muted opacity-40" :
                                "border-border"
                              }`}
                            >
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-muted-foreground">Reason: {t.review_reason}</p>
                                  {status === "accepted" && <Badge variant="outline" className="text-success border-success/30 text-[10px]">Accepted</Badge>}
                                  {status === "rejected" && <Badge variant="outline" className="text-muted-foreground text-[10px]">Rejected</Badge>}
                                </div>
                                {status === "pending" && (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => acceptSingleReview(img.id, i)}
                                      disabled={insertTrips.isPending || !edits.pickup_time || !edits.dropoff_time}
                                    >
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      Accept
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => rejectSingleReview(img.id, i)}
                                    >
                                      <XCircle className="h-3 w-3 mr-1" />
                                      Reject
                                    </Button>
                                  </div>
                                )}
                              </div>
                              {status === "pending" && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Member</label>
                                    <Input
                                      value={edits.member_name ?? t.member_name}
                                      onChange={(e) => updateReviewEdit(img.id, i, "member_name", e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Trip #</label>
                                    <Input
                                      value={edits.trip_number ?? t.trip_number}
                                      onChange={(e) => updateReviewEdit(img.id, i, "trip_number", e.target.value)}
                                      className="h-7 text-xs w-16"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">PU Time</label>
                                    <Input
                                      type="time"
                                      value={edits.pickup_time ?? t.pickup_time ?? ""}
                                      onChange={(e) => updateReviewEdit(img.id, i, "pickup_time", e.target.value)}
                                      className={`h-7 text-xs ${!edits.pickup_time ? "border-warning" : ""}`}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">DO Time</label>
                                    <Input
                                      type="time"
                                      value={edits.dropoff_time ?? t.dropoff_time ?? ""}
                                      onChange={(e) => updateReviewEdit(img.id, i, "dropoff_time", e.target.value)}
                                      className={`h-7 text-xs ${!edits.dropoff_time ? "border-warning" : ""}`}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">Miles</label>
                                    <Input
                                      type="number"
                                      value={edits.mileage !== undefined ? (edits.mileage ?? "") : (t.mileage ?? "")}
                                      onChange={(e) => updateReviewEdit(img.id, i, "mileage", e.target.value ? Number(e.target.value) : null)}
                                      className="h-7 text-xs w-20"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">PU Address</label>
                                    <Input
                                      value={edits.pickup_address ?? t.pickup_address ?? ""}
                                      onChange={(e) => updateReviewEdit(img.id, i, "pickup_address", e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-muted-foreground block mb-1">DO Address</label>
                                    <Input
                                      value={edits.dropoff_address ?? t.dropoff_address ?? ""}
                                      onChange={(e) => updateReviewEdit(img.id, i, "dropoff_address", e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Skipped */}
                    {(img.result.skipped ?? []).length > 0 && (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">Skipped: </span>
                        {img.result.skipped!.map((s, i) => (
                          <span key={i}>
                            {s.member_name} ({s.reason}){i < img.result!.skipped!.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Rules Card */}
        {images.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-card border border-border rounded-xl p-5 space-y-4" style={{ boxShadow: "var(--shadow-card)" }}>
            <h3 className="font-semibold text-sm">Extraction & Validation Rules</h3>
            <div className="space-y-3 text-sm">
              {[
                { icon: CheckCircle, color: "text-success", text: "Extracts: Member Name, Trip # (A/B), PU/DO times, mileage, addresses" },
                { icon: CheckCircle, color: "text-success", text: "Driver name extracted from top bar of screenshot" },
                { icon: ImageIcon, color: "text-primary", text: "Upload multiple screenshots — processed sequentially to avoid rate limits" },
                { icon: AlertCircle, color: "text-warning", text: "Trips with CANCELLED watermarks are automatically rejected" },
                { icon: Clock, color: "text-warning", text: "Trips missing PU or DO times are flagged for review" },
                { icon: XCircle, color: "text-destructive", text: "Duplicate trips (same date/driver/member/trip#/time) are not re-saved" },
              ].map((rule, i) => (
                <div key={i} className="flex items-start gap-3">
                  <rule.icon className={`h-4 w-4 ${rule.color} mt-0.5 flex-shrink-0`} />
                  <span className="text-muted-foreground">{rule.text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
}
