import React from 'react';
import { EmployeeDirectory } from './EmployeeDirectory';

export const PRIMARY_DISCIPLINES = [
  "BIM - ACS",
  "Structure",
  "MEP - HVAC",
  "MEP - Electrical",
  "MEP - Plumbing",
  "Fire Protection",
  "Façade / Envelope",
  "Coordination & QA",
  "AI & Automation",
  "Estimation"
];

export const TeamEfficiency: React.FC<React.ComponentProps<typeof EmployeeDirectory>> = (props) => {
  return <EmployeeDirectory {...props} />;
};
export default TeamEfficiency;
