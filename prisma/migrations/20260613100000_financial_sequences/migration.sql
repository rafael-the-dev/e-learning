BEGIN TRY

BEGIN TRAN;

-- InvoiceSequence: seed from the highest numeric suffix of existing invoice numbers
DECLARE @maxInvoice BIGINT;
SELECT @maxInvoice = ISNULL(
    MAX(TRY_CAST(SUBSTRING(invoiceNumber, CHARINDEX('-', invoiceNumber) + 1, LEN(invoiceNumber)) AS BIGINT)),
    0
)
FROM [dbo].[invoices];

DECLARE @invoiceSql NVARCHAR(500);
SET @invoiceSql = N'CREATE SEQUENCE [dbo].[InvoiceSequence] START WITH '
    + CAST(@maxInvoice + 1 AS NVARCHAR(20))
    + N' INCREMENT BY 1 NO CACHE;';
EXEC sp_executesql @invoiceSql;

-- PaymentSequence
DECLARE @maxPayment BIGINT;
SELECT @maxPayment = ISNULL(
    MAX(TRY_CAST(SUBSTRING(paymentNumber, CHARINDEX('-', paymentNumber) + 1, LEN(paymentNumber)) AS BIGINT)),
    0
)
FROM [dbo].[payments];

DECLARE @paymentSql NVARCHAR(500);
SET @paymentSql = N'CREATE SEQUENCE [dbo].[PaymentSequence] START WITH '
    + CAST(@maxPayment + 1 AS NVARCHAR(20))
    + N' INCREMENT BY 1 NO CACHE;';
EXEC sp_executesql @paymentSql;

-- ReceiptSequence
DECLARE @maxReceipt BIGINT;
SELECT @maxReceipt = ISNULL(
    MAX(TRY_CAST(SUBSTRING(receiptNumber, CHARINDEX('-', receiptNumber) + 1, LEN(receiptNumber)) AS BIGINT)),
    0
)
FROM [dbo].[receipts];

DECLARE @receiptSql NVARCHAR(500);
SET @receiptSql = N'CREATE SEQUENCE [dbo].[ReceiptSequence] START WITH '
    + CAST(@maxReceipt + 1 AS NVARCHAR(20))
    + N' INCREMENT BY 1 NO CACHE;';
EXEC sp_executesql @receiptSql;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
