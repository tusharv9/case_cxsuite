// ===== CHANNEL BADGE =====
import { Phone, Mail, MessageSquare, MessageCircle, Building2, Share2, HelpCircle, Smartphone } from 'lucide-react';
import './ChannelBadge.css';

export function ChannelBadge({ channel }) {
  const norm = (channel || 'Voice').trim().toLowerCase();

  let icon = <Phone size={10} strokeWidth={2.5} />;
  let label = channel || 'Voice';
  let badgeClass = 'channel-badge--voice';

  if (norm === 'email') {
    icon = <Mail size={10} strokeWidth={2.5} />;
    label = 'Email';
    badgeClass = 'channel-badge--email';
  } else if (norm === 'whatsapp') {
    icon = <MessageSquare size={10} strokeWidth={2.5} />;
    label = 'WhatsApp';
    badgeClass = 'channel-badge--whatsapp';
  } else if (norm === 'sms') {
    icon = <MessageCircle size={10} strokeWidth={2.5} />;
    label = 'SMS';
    badgeClass = 'channel-badge--sms';
  } else if (norm === 'branch' || norm === 'in person') {
    icon = <Building2 size={10} strokeWidth={2.5} />;
    label = 'Branch';
    badgeClass = 'channel-badge--branch';
  } else if (norm === 'web chat' || norm === 'webchat') {
    icon = <MessageSquare size={10} strokeWidth={2.5} />;
    label = 'Web Chat';
    badgeClass = 'channel-badge--webchat';
  } else if (norm === 'social') {
    icon = <Share2 size={10} strokeWidth={2.5} />;
    label = 'Social';
    badgeClass = 'channel-badge--social';
  } else if (norm === 'mobile' || norm === 'mobile app') {
    icon = <Smartphone size={10} strokeWidth={2.5} />;
    label = 'Mobile App';
    badgeClass = 'channel-badge--mobile';
  } else if (norm === 'phone' || norm === 'voice') {
    icon = <Phone size={10} strokeWidth={2.5} />;
    label = 'Voice';
    badgeClass = 'channel-badge--voice';
  } else {
    icon = <HelpCircle size={10} strokeWidth={2.5} />;
    label = channel;
    badgeClass = 'channel-badge--default';
  }

  return (
    <span className={`channel-badge ${badgeClass}`}>
      <span className="channel-badge__icon-circle">{icon}</span>
      <span className="channel-badge__label">{label}</span>
    </span>
  );
}
