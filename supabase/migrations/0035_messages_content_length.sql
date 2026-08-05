-- 0035_messages_content_length.sql
-- Enforce a message length cap in the database. The client already limits
-- input to 2000 chars (RoomView), but messages.content had no CHECK
-- constraint and send_message accepted any length, so a buggy or malicious
-- client could store arbitrarily large rows. signal_replies already had this
-- bound (0005); messages now matches it. NOT VALID keeps the migration from
-- ever blocking on pre-existing data; new writes are always validated.

alter table public.messages
  add constraint messages_content_length
  check (content is null or char_length(content) between 1 and 2000)
  not valid;

alter table public.messages
  validate constraint messages_content_length;
