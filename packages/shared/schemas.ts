import { z } from 'zod';

export const tomtomFlowSegmentSchema = z.object({
  flowSegmentData: z.object({
    currentSpeed: z.number().positive(),
    freeFlowSpeed: z.number().positive(),
    currentTravelTime: z.number().nonnegative(),
    freeFlowTravelTime: z.number().nonnegative(),
    confidence: z.number().min(0).max(1),
    roadClosure: z.boolean(),
  }),
});

export type TomTomFlowSegment = z.infer<typeof tomtomFlowSegmentSchema>;

export const trafficReadingSchema = z.object({
  segmentId: z.string(),
  time: z.string().datetime(),
  currentSpeed: z.number().nonnegative(),
  freeFlowSpeed: z.number().positive(),
  currentTravelTime: z.number().nonnegative(),
  freeFlowTravelTime: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  congestionIndex: z.number().min(0).max(1),
  roadClosure: z.boolean(),
});

export type TrafficReadingInput = z.infer<typeof trafficReadingSchema>;
