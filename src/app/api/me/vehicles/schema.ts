import { z } from "zod";

export const VehicleBody = z.strictObject({
  car_type: z.enum(["sedan", "suv", "van", "van_vip", "mpv_premium"]),
  plate: z.string().trim().min(2).max(20),
  seats: z.number().int().min(1).max(15),
  luggage: z.number().int().min(0).max(20),
});
