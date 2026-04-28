import { redirect } from "next/navigation";

export default function InterviewDefaultsRedirect() {
  redirect("/settings/applications");
}
