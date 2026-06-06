-- Add paymentId to credit_applications to link wallet credit applied during a payment transaction
ALTER TABLE credit_applications ADD paymentId NVARCHAR(1000) NULL;

ALTER TABLE credit_applications
  ADD CONSTRAINT credit_applications_paymentId_fkey
  FOREIGN KEY (paymentId) REFERENCES payments(id)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
