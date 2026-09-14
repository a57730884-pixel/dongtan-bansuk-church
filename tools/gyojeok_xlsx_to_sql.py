# -*- coding: utf-8 -*-
"""
교적 엑셀(.xlsx) → Supabase 등록용 SQL 변환기  ·  동탄반석교회

사용법
    python tools/gyojeok_xlsx_to_sql.py "교적.xlsx" supabase/교적_등록.sql
    (저장할 파일 이름을 생략하면 화면에 그대로 출력합니다)
    만들어진 .sql 을 Supabase ▸ SQL Editor 에 붙여넣고 Run 하세요.

엑셀 첫 줄은 제목 줄이어야 하며, 아래 이름 중 아무거나 쓰면 알아봅니다.
    이름 / 성명            → name        (필수)
    생년월일 / 생일        → birth       (YYYY-MM-DD, YYYYMMDD, 1981.8.19 모두 인식)
    성별                   → sex
    세대주 / 세대주이름    → head        (본인이 세대주면 본인 이름)
    관계 / 세대주와의관계  → relation
    배우자                 → spouse
    직분 / 직책            → role
    구역 / 그룹 / 구역그룹 → groups
    주일학교               → ss_role
    휴대폰 / 연락처 / 전화 → phone
    주소                   → address
    신급                   → grade
    비고 / 메모            → (무시)

매칭키(member_key = 이름|YYYYMMDD)는 이 스크립트가 자동으로 만듭니다.
생년월일이 없으면 '이름|' 으로 만들어지며, 그 사람은 홈페이지에서 자동
정회원 인증이 되지 않습니다(관리자가 교적관리 ▸ 권한 관리에서 수동 연결).

주민등록번호 칸이 있어도 옮기지 않습니다(설계서 8장 — 보관하면 위험만 늘어남).
"""
import sys, re, io, datetime

try:
    from openpyxl import load_workbook
except ImportError:
    sys.exit("openpyxl 이 필요합니다.  pip install openpyxl")

HEADERS = {
    "name":     ["이름", "성명", "교인명"],
    "birth":    ["생년월일", "생일", "출생일"],
    "sex":      ["성별"],
    "head":     ["세대주", "세대주이름", "세대주 이름"],
    "relation": ["관계", "세대주와의관계", "세대주와의 관계", "가족관계"],
    "spouse":   ["배우자"],
    "role":     ["직분", "직책"],
    "groups":   ["구역", "그룹", "구역그룹", "구역·그룹", "소속"],
    "ss_role":  ["주일학교", "교회학교"],
    "phone":    ["휴대폰", "연락처", "전화", "전화번호", "핸드폰"],
    "address":  ["주소"],
    "grade":    ["신급"],
}


def norm(s):
    return re.sub(r"[\s()·.]", "", str(s or "")).lower()


def map_columns(header_row):
    """엑셀 제목 줄 → {컬럼이름: 열번호}"""
    found = {}
    for idx, cell in enumerate(header_row):
        key = norm(cell)
        if not key:
            continue
        for col, names in HEADERS.items():
            if col in found:
                continue
            if any(norm(n) == key for n in names):
                found[col] = idx
                break
    return found


def parse_birth(v):
    """여러 형태의 생년월일 → (YYYY-MM-DD, YYYYMMDD). 못 읽으면 (None, '')."""
    if v is None or str(v).strip() == "":
        return None, ""
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d"), v.strftime("%Y%m%d")
    digits = re.sub(r"[^0-9]", "", str(v))
    if len(digits) == 8:
        return "%s-%s-%s" % (digits[:4], digits[4:6], digits[6:8]), digits
    if len(digits) == 6:      # 주민번호 앞자리 형태 — 1930~2029 사이로 추정
        yy = int(digits[:2])
        year = 2000 + yy if yy <= 29 else 1900 + yy
        iso = "%04d-%s-%s" % (year, digits[2:4], digits[4:6])
        return iso, iso.replace("-", "")
    return None, ""


def q(s):
    """SQL 문자열 리터럴(작은따옴표 이스케이프). 빈 값은 NULL."""
    if s is None:
        return "null"
    s = str(s).strip()
    if s == "":
        return "null"
    return "'" + s.replace("'", "''") + "'"


def phone_fmt(v):
    d = re.sub(r"[^0-9]", "", str(v or ""))
    if not d:
        return ""
    if len(d) == 10 and not d.startswith("0"):
        d = "0" + d                      # 엑셀이 앞 0을 지운 경우 복원
    if len(d) == 11:
        return d[:3] + "-" + d[3:7] + "-" + d[7:]
    if len(d) == 10:
        return d[:3] + "-" + d[3:6] + "-" + d[6:]
    return d


def main(path, out_path=None):
    """out_path 를 주면 그 파일(UTF-8)로 저장하고, 없으면 화면에 출력한다."""
    wb = load_workbook(path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        sys.exit("빈 엑셀입니다.")

    cols = map_columns(rows[0])
    if "name" not in cols:
        sys.exit("제목 줄에서 '이름' 칸을 찾지 못했습니다. 첫 줄이 제목 줄인지 확인해 주세요.")

    def get(row, key):
        i = cols.get(key)
        if i is None or i >= len(row):
            return ""
        v = row[i]
        return "" if v is None else str(v).strip()

    lines_out = []
    def emit(text=""):
        lines_out.append(text)

    out, skipped = [], 0
    for row in rows[1:]:
        name = get(row, "name")
        if not name:
            skipped += 1
            continue
        iso, ymd = parse_birth(row[cols["birth"]] if "birth" in cols and cols["birth"] < len(row) else None)
        head = get(row, "head") or name
        vals = [
            q(name), q(iso) if iso else "null", q(name + "|" + ymd),
            q(head), q(get(row, "relation")), q(get(row, "spouse")),
            q(get(row, "groups")), q(get(row, "role")), q(get(row, "grade")),
            q(get(row, "sex")), q(phone_fmt(get(row, "phone"))), q(get(row, "address")),
            q(get(row, "ss_role")),
        ]
        out.append("  (" + ", ".join(vals) + ")")

    emit("-- 동탄반석교회 교적 등록 — %s 에서 변환 (%d명%s)" %
          (path, len(out), (", 이름 없는 %d줄 건너뜀" % skipped) if skipped else ""))
    emit("-- 1) supabase/01~05 를 먼저 실행한 뒤 2) 이 파일을 Run 하세요.")
    emit("-- 배우자매칭키(spouse_key)는 아래 마지막 UPDATE 가 이름으로 자동 연결합니다.\n")
    emit("insert into public.gyojeok")
    emit("  (name, birth, member_key, head, relation, spouse, groups, role, grade, sex, phone, address, ss_role)")
    emit("values")
    emit(",\n".join(out) + ";\n")
    emit("-- 배우자 매칭키 연결: 같은 세대 안에서 이름이 일치하는 사람을 찾아 이어 준다.")
    emit("""update public.gyojeok g
   set spouse_key = s.member_key
  from public.gyojeok s
 where coalesce(nullif(g.spouse,''), '<none>') = s.name
   and coalesce(nullif(g.head,''), g.name) = coalesce(nullif(s.head,''), s.name)
   and g.id <> s.id;""")
    emit("\n-- 확인: select count(*) from public.gyojeok;")

    text = "\n".join(lines_out) + "\n"
    if out_path:
        io.open(out_path, "w", encoding="utf-8", newline="").write(text)
        sys.stderr.write("저장했습니다: %s (%d명)\n" % (out_path, len(out)))
    else:
        try:
            sys.stdout.reconfigure(encoding="utf-8")   # 윈도우 명령 프롬프트(cp949) 대비
        except Exception:
            pass
        sys.stdout.write(text)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
