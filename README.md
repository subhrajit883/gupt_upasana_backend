# Puja Donation Backend

Node.js + Express + MongoDB/Mongoose backend. Razorpay Checkout is implemented with server-side order creation, checkout signature verification, payment API verification, and webhook signature verification.

## 1. Install and run

```bash
npm install
cp .env.example .env
# edit .env values
npm run dev
```

API default: `http://localhost:5000`

## 2. Create first admin (one time)

Set a strong `ADMIN_BOOTSTRAP_KEY` in `.env`, then:

```http
POST /api/auth/bootstrap-admin
x-bootstrap-key: YOUR_ADMIN_BOOTSTRAP_KEY
Content-Type: application/json

{
  "name": "Administrator",
  "phone": "9999999999",
  "email": "admin@example.com",
  "password": "ChangeThisPassword123"
}
```

Remove/rotate `ADMIN_BOOTSTRAP_KEY` after creating admin. Admin login uses `/api/auth/login` like user login.

## 3. Razorpay setup (important)

1. In Razorpay Dashboard, switch to **Test Mode** and copy the Test Key ID and Key Secret into `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
2. Keep `RAZORPAY_CURRENCY=INR`.
3. Configure both webhook URLs: `https://YOUR_API_DOMAIN/api/donations/razorpay/webhook` and `https://YOUR_API_DOMAIN/api/service-bookings/razorpay/webhook`.
4. Subscribe both webhooks to `payment.captured` and `payment.failed` events. Use the same webhook secret for both URLs and set it as `RAZORPAY_WEBHOOK_SECRET` (this is NOT the Key Secret).
5. Deploy/restart the backend after changing env credentials. Never expose `RAZORPAY_KEY_SECRET` or webhook secret in frontend.
6. Frontend loads Razorpay Checkout script `https://checkout.razorpay.com/v1/checkout.js`, calls create-order, opens Checkout using returned `razorpay.keyId`, and posts Checkout response fields to verify-payment.
7. Test success, failure, cancellation, duplicate webhook delivery, and amount mismatch in Test Mode. Use Live credentials only after account activation and your own compliance review.

### Frontend Checkout outline

```js
const orderResponse = await fetch(`${API}/api/donations/create-order`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ packageId, amount, amountOptionId })
});
const data = await orderResponse.json();
if (!data.success) throw new Error(data.message);

const options = {
  key: data.razorpay.keyId,
  amount: data.order.amount,
  currency: data.order.currency,
  name: "Your Puja Trust",
  description: "Puja Donation",
  order_id: data.order.id,
  prefill: data.donor,
  notes: { donationId: data.donationId },
  handler: async (response) => {
    const verify = await fetch(`${API}/api/donations/verify-payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ donationId: data.donationId, ...response })
    });
    const result = await verify.json();
    if (!result.success) throw new Error(result.message);
    // Show payment success and receipt/donation details.
  },
  modal: { ondismiss: () => console.log("Checkout closed") }
};
const checkout = new window.Razorpay(options);
checkout.open();
```

Load the script before the code above:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

**Important:** `payment.captured` webhook is the backup source of truth for asynchronous payment confirmation. Checkout handler alone is not proof of payment. This starter marks `receiptGenerated=true` after payment is captured/verified and allocates a unique receipt number at order creation; actual PDF/email receipt generation is not implemented.

## Service packages and bookings

Admins create services at `/api/services` with `serviceCategory` set to `regular_puja`, `havan`, `seva`, or `special_puja`. `serviceAmounts` is an array of admin-managed price options. For `regular_puja`, each amount must include a unique `frequency`: `weekly`, `monthly`, `half_yearly`, or `yearly`. Service images are uploaded as `serviceImg`; package status is `draft`, `published`, or `archived`, with `active` controlling availability.

Example regular puja package body:
```json
{
  "serviceName": "Lakshmi Puja",
  "serviceCategory": "regular_puja",
  "serviceDescription": "Regular Lakshmi puja service",
  "serviceAmounts": [
    { "label": "Weekly", "amount": 501, "frequency": "weekly" },
    { "label": "Monthly", "amount": 1501, "frequency": "monthly" },
    { "label": "Half-yearly", "amount": 7501, "frequency": "half_yearly" },
    { "label": "Yearly", "amount": 15001, "frequency": "yearly" }
  ],
  "serviceBenefits": ["Puja performed by a priest"],
  "serviceRules": ["Preferred dates are subject to confirmation"],
  "active": true,
  "status": "published"
}
```

Authenticated users create a service booking order with `servicePackageId`, `serviceAmountId`, `devoteeName`, and `devoteeType`. Optional fields include `devoteePhoto`, `devoteeCompanyName`, `devoteeDesignation`, `traditionalIntention`, `gotra`, `sankalp`, `preferredDate`, and `preferredLocation`. For organizations, send `employees` as a JSON array of `{ "name": "..." }`; for individuals, send `familyMembers` as a JSON array of `{ "name": "...", "relation": "..." }`. Upload employee and family photos as `employeePhotos` and `familyPhotos` files in matching array order. A devotee photo may be uploaded as `devoteePhoto`. The same endpoint accepts JSON with photo objects containing `url` and optional `publicId`.

The server selects the amount from the service package and handles Razorpay order creation, signature/payment verification, and the webhook. Do not send a client-calculated amount.

## 4. Package payload examples

Static fixed-amount package:
```json
{
  "name": "Annadanam",
  "description": "Support community meal seva",
  "packageImg": "https://cdn.example.com/annadanam.jpg",
  "category": "static",
  "allowCustomAmount": false,
  "amounts": [
    { "amount": 501, "label": "Basic", "rules": ["One meal seva"] },
    { "amount": 1001, "label": "Family", "rules": ["Meal seva for family"] }
  ],
  "active": true
}
```

Static custom amount:
```json
{
  "name": "General Donation",
  "category": "static",
  "allowCustomAmount": true,
  "minAmt": 100,
  "maxAmt": 100000,
  "benefits": ["Support temple activities"],
  "active": true
}
```

Dynamic (date-limited) package:
```json
{
  "name": "Durga Puja Special",
  "category": "dynamic",
  "startDate": "2026-10-01T00:00:00.000Z",
  "endDate": "2026-10-31T23:59:59.999Z",
  "allowCustomAmount": true,
  "minAmt": 101,
  "maxAmt": 100000,
  "benefits": ["Special puja offering"],
  "active": true
}
```

## 5. API endpoints

Password reset emails require `EMAIL_USER` and `EMAIL_PASS`; configure `EMAIL_HOST`/`EMAIL_PORT` as needed. Set `FRONTEND_URL` to the frontend origin where `/reset-password?token=...` is handled.

- `POST /api/auth/register` user registration
- `POST /api/auth/login` `{identifier, password}` (phone or email)
- `POST /api/auth/forgot-password` `{email}`; emails a one-hour password reset link when an active account exists
- `POST /api/auth/reset-password` `{token, newPassword}`; consumes the one-time reset token
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/bootstrap-admin` one-time protected admin bootstrap
- `PATCH /api/admin/change-password` `{currentPassword, newPassword}`; changes the signed-in admin's password
- `POST /api/admin/users/:id/password-reset` emails a one-hour reset link to the user's current email address
- `GET /api/packages` public active packages; admin can view all with token
- `POST /api/packages` admin create; `PATCH/DELETE /api/packages/:id`
- `GET /api/services` public active services; admin service listing at `/api/services/admin/all`
- `POST /api/services` admin create; `PATCH/DELETE /api/services/:id`; admin detail at `/api/services/admin/:id`
- `POST /api/service-bookings/create-order` authenticated; amount is selected server-side from the package
- `POST /api/service-bookings/verify-payment` authenticated signature + payment API verification
- `POST /api/service-bookings/razorpay/webhook` Razorpay webhook (raw body)
- `GET /api/service-bookings/my`; admin list/detail at `/api/service-bookings/admin/all` and `/api/service-bookings/admin/:id`
- `PATCH /api/service-bookings/:id/status` admin booking status management
- `POST /api/donations/create-order` authenticated; server validates amount and creates Razorpay order
- `POST /api/donations/verify-payment` authenticated signature + payment API verification
- `POST /api/donations/razorpay/webhook` Razorpay webhook (raw body)
- `GET /api/donations/my` current user's donations
- `GET /api/donations/admin/all` admin donation list filters `status,userId,from,to`
- `GET /api/donations/summary` admin totals + donor aggregate
- `GET /api/donations/:id` owner or admin
- `POST /api/bookings`, `GET /api/bookings/my`; admin `/admin/all`, `PATCH /:id`
- `GET /api/puja-updates` published updates; admin create/edit/publish/delete
- `GET/PATCH /api/users/profile`; admin `GET /api/users`, `/api/admin/users`
- `GET /api/users/:userId/donations` owner or admin

## Production checklist

- Use HTTPS; set exact `FRONTEND_URL` origins and production cookie settings.
- Use a strong unique JWT secret and bootstrap key; remove bootstrap key after admin creation.
- Add schema validation/rate limiting/monitoring appropriate to deployment.
- Add receipt PDF + email delivery and a push provider (e.g. Firebase Cloud Messaging) before production launch.
- Keep Razorpay secrets server-only. Webhook endpoint must receive raw request bytes.
- Review tax/80G eligibility and receipt wording with your organization; don't claim tax exemption unless authorized.
