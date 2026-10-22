import { Module } from "@medusajs/framework/utils";

import PayPalPaymentProviderService from "./service";

export const PAYPAL_MODULE = "paypal";

export default Module(PAYPAL_MODULE, {
  service: PayPalPaymentProviderService,
});