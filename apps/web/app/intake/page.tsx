import { IntakeForm } from "./intake-form";
import { intakeFormProps } from "./intake-page-props";

export default async function IntakePage() {
  return <IntakeForm {...await intakeFormProps()} />;
}
