ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'authorized';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE "MoneyIntentKind" ADD VALUE IF NOT EXISTS 'capture_client_payment';
ALTER TYPE "MoneyIntentKind" ADD VALUE IF NOT EXISTS 'cancel_authorization';
