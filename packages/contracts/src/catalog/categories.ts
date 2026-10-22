import { z } from "zod";
import { CatalogName, ServiceCategory } from "./common.js";

/** `GET /service-categories`: the barbershop's categories, in display order. */
export const CategoriesOutput = z.object({
  categories: z.array(ServiceCategory),
});
export type CategoriesOutput = z.infer<typeof CategoriesOutput>;

/** `POST /service-categories`. The category goes to the end of the order. */
export const CreateCategoryInput = z.object({ name: CatalogName });
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

/** `PATCH /service-categories/{id}`. */
export const RenameCategoryInput = z.object({ name: CatalogName });
export type RenameCategoryInput = z.infer<typeof RenameCategoryInput>;

/** `PUT /service-categories/order`: every category of the barbershop, in the new order. */
export const OrderInput = z.object({ ids: z.array(z.uuid()) });
export type OrderInput = z.infer<typeof OrderInput>;
