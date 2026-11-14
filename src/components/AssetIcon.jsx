import React from "react";
import {
  Boxes,
  Cloud,
  Database,
  GitBranch,
  Globe,
  HardDrive,
  Key,
  Lock,
  Mail,
  Monitor,
  Server,
  Shield,
  Workflow,
} from "lucide-react";

export const TYPE_ICONS = {
  firewall: Shield,
  web: Globe,
  vpn: Lock,
  email: Mail,
  app: Boxes,
  api: Workflow,
  domain: Key,
  storage: HardDrive,
  database: Database,
  workstation: Monitor,
  cloud: Cloud,
  ci: GitBranch,
};

export default function AssetIcon({ type, size = 16, className }) {
  const Icon = TYPE_ICONS[type] || Server;
  return <Icon size={size} className={className} />;
}
