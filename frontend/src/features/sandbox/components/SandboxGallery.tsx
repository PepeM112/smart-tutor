'use client';

import { ButtonsSection } from './ButtonsSection';
import { FeedbackSection } from './FeedbackSection';
import { FormFieldsSection } from './FormFieldsSection';
import { ListControlsSection } from './ListControlsSection';
import { OverlaysSection } from './OverlaysSection';
import { PanelsSection } from './PanelsSection';
import { SurfacesSection } from './SurfacesSection';
import { TablesSection } from './TablesSection';

/** Every shared UI piece of the app in one page, with static data. Nothing here reads or writes the backend. */
export function SandboxGallery() {
  return (
    <div className="divide-y divide-hairline">
      <ButtonsSection />
      <FormFieldsSection />
      <SurfacesSection />
      <OverlaysSection />
      <PanelsSection />
      <TablesSection />
      <ListControlsSection />
      <FeedbackSection />
    </div>
  );
}
