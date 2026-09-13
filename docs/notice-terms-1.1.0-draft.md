# 利用規約・プライバシーポリシー改定の事前告知（下書き）

状態: **送らないことに決定（2026-09-13 宮澤）。** 本登録 5 件の内訳は宮澤のアドレス 2 つ、E2E テスト用、社員 1 名、社外 1 名（オンボーディング未完了）で、実質的な利用者がいないため。1.1.0 は 2026-09-28 に PR #32 で有効化する。利用者が増えたあとの改定で使うためのひな形として残す。
対象: 本登録ユーザー（2026-09-13 実測 5 名）。匿名ユーザーは連絡先が無いので対象外（次回アクセス時に同意画面で案内される）。

送る前に確認すること:

- 【施行日】を決める。規約第11条は「効力発生時期が到来するまでに周知する」としか定めていないので、告知から施行までの日数は法律上の最低日数ではなく当社の判断になる
- 施行日当日に `lib/legal/versions.ts` を 1.1.0 に上げるデプロイを行う（それまでは同意画面は出ない）
- 文面を弁護士に見せるかは任意。本文の要約に誤りが無いかだけでも見てもらうと安全

社名と問い合わせ先はプライバシーポリシー第12条、URL は 2026-09-13 時点の本番（novalis-app.vercel.app）に合わせた。独自ドメインに移すなら差し替える。

変更点の要約は `public/legal/*-1.0.0-ja.md` と `*-1.1.0-ja.md` の差分から書いた。本文と食い違ったら本文が正しい。

---

## 日本語

件名: 【Novalis】利用規約・プライバシーポリシー改定のお知らせ

いつも Novalis をご利用いただきありがとうございます。

【施行日】より、利用規約とプライバシーポリシーを改定します。主な変更点は次のとおりです。

1. 海外の事業者への情報の提供について明記しました（プライバシーポリシー第5条）
   AIの回答生成（Google Gemini）、データの保管（Supabase）、サイトの運営（Vercel）、Messenger連携（Meta）、障害の検知（Sentry）のため、ご入力内容などの情報を海外の事業者に提供します。提供先の国と、提供する情報の内容を記載しています。
2. 利用規約を変更するときの手続きを定めました（利用規約第11条）
   変更する場合は、変更内容と効力が生じる日を事前にお知らせします。
3. 当社の責任の範囲に関する条文を整理しました（利用規約第9条）
4. 紛争が生じた場合の裁判所に関する条文を修正しました（利用規約第15条）

改定後も引き続きご利用いただくには、改定後の内容への同意が必要です。【施行日】以降に Novalis を開くと同意画面が表示されますので、内容をご確認のうえ同意してください。同意いただくまでは、AIへのご質問（Web・Messenger）をご利用いただけません。

改定後の全文は、次のページでご確認いただけます。
利用規約: https://novalis-app.vercel.app/ja/legal/terms
プライバシーポリシー: https://novalis-app.vercel.app/ja/legal/privacy

※全文ページは施行日までは改定前の内容を表示します。改定後の全文を事前に確認したい方は、本メールへの返信でお問い合わせください。

ご不明な点はryuhei.miyasawa@novalisgroup.bizまでご連絡ください。

株式会社ノヴァリス

---

## English

Subject: [Novalis] Updates to our Terms of Service and Privacy Policy

Thank you for using Novalis.

Our Terms of Service and Privacy Policy will change on 【effective date】. The main changes are:

1. We now state clearly how we share information with companies outside Japan (Privacy Policy, Article 5)
   To generate AI answers (Google Gemini), store data (Supabase), host the service (Vercel), connect with Messenger (Meta), and detect errors (Sentry), we provide information such as what you type to companies outside Japan. The policy lists the countries and the information provided.
2. We set out how we change the Terms (Terms of Service, Article 11)
   Before any change, we will tell you what changes and when it takes effect.
3. We revised the article on the scope of our liability (Terms of Service, Article 9)
4. We revised the article on which court handles disputes (Terms of Service, Article 15)

To keep using Novalis, you need to agree to the updated documents. From 【effective date】, an agreement screen will appear when you open Novalis. Please review the documents and agree. Until you agree, you cannot ask the AI questions (on the web or in Messenger).

Full text:
Terms of Service: https://novalis-app.vercel.app/en/legal/terms
Privacy Policy: https://novalis-app.vercel.app/en/legal/privacy

Note: these pages show the current version until the effective date. If you would like to read the updated text before then, reply to this email.

If you have any questions, please contact ryuhei.miyasawa@novalisgroup.biz.

Novalis Inc.

---

## Tagalog

Paksa: [Novalis] Mga pagbabago sa aming Mga Tuntunin ng Serbisyo at Patakaran sa Privacy

Salamat sa paggamit ng Novalis.

Mula sa 【petsa ng pagkakabisa】, binabago namin ang Mga Tuntunin ng Serbisyo at ang Patakaran sa Privacy. Ang mga pangunahing pagbabago:

1. Malinaw na isinaad kung paano ibinabahagi ang impormasyon sa mga kumpanya sa labas ng Japan (Patakaran sa Privacy, Artikulo 5)
   Para sa pagbuo ng mga sagot ng AI (Google Gemini), pag-iimbak ng data (Supabase), pag-host ng serbisyo (Vercel), pagkonekta sa Messenger (Meta), at pagtukoy ng mga error (Sentry), ibinibigay namin sa mga kumpanya sa labas ng Japan ang impormasyon tulad ng iyong mga mensahe. Nakalista sa patakaran ang mga bansa at ang impormasyong ibinibigay.
2. Itinakda ang proseso ng pagbabago sa Mga Tuntunin (Mga Tuntunin ng Serbisyo, Artikulo 11)
   Bago ang anumang pagbabago, ipaaalam namin ang nilalaman at petsa ng pagkakabisa.
3. Binago ang artikulo tungkol sa lawak ng aming pananagutan (Mga Tuntunin ng Serbisyo, Artikulo 9)
4. Binago ang artikulo tungkol sa korte para sa mga hindi pagkakaunawaan (Mga Tuntunin ng Serbisyo, Artikulo 15)

Upang patuloy na gamitin ang Novalis, kailangan ang iyong pagsang-ayon sa mga binagong dokumento. Mula sa 【petsa ng pagkakabisa】, may lalabas na screen ng pagsang-ayon kapag buksan ang Novalis. Mangyaring suriin at sumang-ayon. Hangga't hindi sumasang-ayon, hindi maaaring magtanong sa AI (sa web o sa Messenger).

Buong teksto:
Mga Tuntunin ng Serbisyo: https://novalis-app.vercel.app/tl/legal/terms
Patakaran sa Privacy: https://novalis-app.vercel.app/tl/legal/privacy

Tandaan: ipinapakita ng mga pahinang ito ang kasalukuyang bersyon hanggang sa petsa ng pagkakabisa. Kung nais basahin ang binagong teksto bago nito, tumugon sa email na ito.

Para sa mga tanong, makipag-ugnayan sa ryuhei.miyasawa@novalisgroup.biz.

Novalis Inc.
