// amplify/data/resource.ts - FIXED with proper owner authorization
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
    allow.owner() // ✅ Only the owner can access their upload jobs
  ]),

  // Table 1: Working invoice data (gets deleted after submission)
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
    // Full S3 bucket path for backend storage
    pdfS3FullPath: a.string(), // Complete path including bucket name
  })
  .authorization(allow => [
    allow.owner() // ✅ Only the owner can access their invoices
  ]),

  // Table 2: Submitted invoice data (permanent storage)
  SubmittedInvoice: a.model({
    invoiceId: a.string().required(),
    sellerId: a.string().required(),
    debtorId: a.string().required(),
    currency: a.string().required(),
    amount: a.float().required(),
    product: a.string().required(),
    issueDate: a.date().required(),
    dueDate: a.date().required(),
    uploadDate: a.date().required(),
    submittedDate: a.date().required(),
    submittedAt: a.datetime().required(),
    // Original upload job reference
    originalUploadJobId: a.string(),
    originalInvoiceId: a.string(), // Reference to the original Invoice table ID
    // PDF document storage (copied from Invoice)
    pdfS3Key: a.string(),
    pdfFileName: a.string(),
    pdfUploadedAt: a.datetime(),
    pdfS3FullPath: a.string(),
    // Submission metadata
    submittedBy: a.string(), // User who submitted
  })
  .authorization(allow => [
    allow.owner() // ✅ Only the owner can access their submitted invoices
  ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",
  },
});