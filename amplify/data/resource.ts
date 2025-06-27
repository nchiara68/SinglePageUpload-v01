// amplify/data/resource.ts - Updated with full PDF path support
import { type ClientSchema, a, defineData } from "@aws-amplify/backend";

const schema = a.schema({
  FileType: a.enum(['CSV', 'XLSX']),
  ProcessingStatus: a.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']),
  Currency: a.enum(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY']),

  InvoiceUploadJob: a.model({
    fileName: a.string().required(),
    fileType: a.ref('FileType').required(),
    status: a.string().required(),
    s3Key: a.string().required(),
    totalInvoices: a.integer(),
    successfulInvoices: a.integer(),
    failedInvoices: a.integer(),
    errorMessage: a.string(),
    processingErrors: a.json(),
    processingStartedAt: a.datetime(),
    processingCompletedAt: a.datetime(),
    invoices: a.hasMany('Invoice', 'uploadJobId'),
  })
  .authorization(allow => [
    allow.authenticated()
  ]),

  Invoice: a.model({
    invoiceId: a.string().required(),
    sellerId: a.string().required(),
    debtorId: a.string().required(),
    currency: a.string().required(),
    amount: a.float().required(),
    product: a.string().required(),
    issueDate: a.date().required(),
    dueDate: a.date().required(),
    uploadDate: a.date().required(),
    uploadJobId: a.id().required(),
    uploadJob: a.belongsTo('InvoiceUploadJob', 'uploadJobId'),
    isValid: a.boolean(),
    validationErrors: a.string().array(),
    // PDF document storage
    pdfS3Key: a.string(), // Relative S3 path (user-files/identity/invoices/...)
    pdfFileName: a.string(), // Original filename for display
    pdfUploadedAt: a.datetime(), // When PDF was uploaded
    // ✅ NEW: Full S3 bucket path for backend storage
    pdfS3FullPath: a.string(), // Complete path including bucket name
  })
  .authorization(allow => [
    allow.authenticated()
  ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});