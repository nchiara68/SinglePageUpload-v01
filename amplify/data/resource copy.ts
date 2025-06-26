// amplify/data/resource.ts - NO FUNCTION IMPORTS
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
    allow.authenticated()  // ✅ Only user access needed
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
  })
  .authorization(allow => [
    allow.authenticated()  // ✅ Only user access needed
  ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "userPool",  // ✅ Users authenticate with Cognito
  },
});